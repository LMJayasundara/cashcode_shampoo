const express = require("express");
const fs = require("fs");
const download = require("download");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require('@serialport/parser-readline')
const cors = require("cors");
const http = require("http");
var wifi = require("node-wifi");
// var Wifi = require('rpi-wifi-connection');
const { checkNetworkStatus } = require('check-network-status');
var app = express();
const {
    callSyncAllApi,
    callKegApi,
    callTransactionApi,
    callSaveKegDetailsApi
} = require('./Request')
var sha1 = require('sha1');
var server = http.createServer(app);
var io = require("socket.io")(server);
const BillValidator = require('cashcode-nodejs');

var productDataList = [];
var printerStatus = 0;
var previousPrinterStatus = 1;
var statusCount = 0;
var globalSocket;
var serialDataReceived = "";
var serialDataSend;
var coun222t = 1;
var vol = "0";
var dateTime = null;
var machine_id = "";
var token = "";
var barcodeValue = "";
var id_batch = "";

eval(fs.readFileSync("printer.js") + "");
app.use(cors());
app.set("port", 3001);

app.use(express.static('public'));

var portName = "/dev/ttyS0"; //This is the standard Raspberry Pi Serial port
var sp = new SerialPort({
    path: portName,
    baudRate: 9600,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    flowControl: false
});

const parser = sp.pipe(new ReadlineParser({
    delimiter: '\r\n'
}));
sp.pipe(parser);

sp.on("close", function (err) {
    console.log("+++++port closed");
});

sp.on("error", function (err) {
    console.error("++++++++++++error", err);
});

sp.on("open", function () {
    console.log("++++++++port opened...");
});

parser.on("data", function (reply) {
    if (reply != null || reply != undefined) {
        serialDataReceived = reply.toString();
    }
    console.log("receive " + serialDataReceived);
    sp.write(serialDataSend + "\n");
    console.log("send " + serialDataSend);
});

server.listen(app.get('port'), function (err) {
    if (err) {
        console.log("Server error: ", err.message);
    } else {
        console.log('Running on port: ' + app.get('port'));
    }
});

/* Node wifi */
wifi.init({
    iface: null, // network interface, choose a random wifi interface if set to null
});

/* Rpi wifi */
// var wifi = new Wifi();

let total = 0;
let maxAmtx = 0;

const device = new BillValidator({
    baudRate: 19200,
    autoPort: true,
    boardKeywordIdentifier: 'FTDI'
});

function getTotal(cash) {
    total = total + cash;
    return total;
};
  
function reset(){
    total = 0;
};

(async function () {
    await device.connect();

    io.sockets.on("connection", function (socket) {
        console.log("connected");
        getPrinterStatus();
        io.sockets.emit("CONNECTED", "nice");
        io.sockets.emit("SERIAL_DATA", serialDataReceived);
        setMachineIDandToken();
        socket.emit("FILE_DETAILS", readAll());
        socket.on("TAP", function (data) {
            console.log("data received");
        });

        socket.on("READ_ALL", function (data) {
            socket.emit("FILE_DETAILS", readAll());
            console.log("data received");
        });

        socket.on("DOWNLOAD", function (urlObject) {
            //socket.emit("FILE_DETAILS", readAll());
            var imageCount = 0;
            var urls = urlObject.split(",");
            urls.forEach((url) => {
                console.log(url);
                async(function () {
                    await(
                        download(url, "dist").then(() => {
                            imageCount++;
                            console.log("downloaded");
                            if (urls.length == imageCount) socket.emit("DOWNLOADED", 1);
                        })
                    );
                })();
                console.log("loop +" + url);
            });
        });

        socket.on("IS_WIFI_ON", function (data) {
            /* Node wifi */
            checkNetworkStatus({
                timeout: 3000,
                url: 'https://google.com'
            }).then(value => {
                socket.emit("IS_WIFI_ON", {
                    value,
                    data
                })
            });

            /* Rpi wifi */
            // wifi.getState().then((connected) => {
            //   if(connected) {
            //     console.log("CONNECTION");
            //     console.log(connected);
            //     var object = {value: true, data: data};
            //     socket.emit("IS_WIFI_ON", object);
            //   } else {
            //     console.log("NOT CONNECTION");
            //     var object = {value: false, data: data};
            //     socket.emit("IS_WIFI_ON", object);
            //   }

            // })
            // .catch((error) => {
            //   console.log(error);
            //   var object = {value: false, data: data};
            //   socket.emit("IS_WIFI_ON", object);
            // });
        });

        function setMachineIDandToken() {
            try {
                var constData = readTextFile("", "machine_id.txt");
                machine_id = constData.split(',')[0];
                var tokenKey = constData.split(',')[1];
                token = sha1(tokenKey + machine_id).toLocaleUpperCase();
            } catch (error) { }
        }

        function addSlashes(data) {
            var returnValue = '';
            data.forEach((value, index) => {
                if (index == 0) {
                    returnValue = value;
                } else if (index > 0) {
                    returnValue = returnValue + "/" + value;
                }
            });
            return returnValue;
        }

        function getProductVolumes(listOfVolumes) {
            var volumes = [];
            var prices = [];
            var discounts = [];
            listOfVolumes.forEach((volumeDetails) => {
                volumes.push(volumeDetails.volume);
                prices.push(volumeDetails.price);
                discounts.push(volumeDetails.discount);
            });
            return {
                volumes,
                prices,
                discounts
            };
        }

        function getProductDetailsFromResponse(callingFrom, productDetails) {
            var product_volumes = null;
            var product = null;
            var kegVol = null;
            if (callingFrom == "fromKeg") {
                product_volumes = getProductVolumes(productDetails.productVolumes);
                product = productDetails.product;
                kegVol = product.volume;
            } else {
                product_volumes = getProductVolumes(productDetails.listOfProductVolume);
                product = productDetails;
                kegVol = product.available_volume;
            }
            console.log("AAAAAAAAAAAAAAAAAAAAAAA   " + product.id_product);
            var fileData =
                product.id_product +
                "," +
                product.product_name +
                "," +
                kegVol +
                "," +
                product.last_refill_date +
                "," +
                product.manufacture_date +
                "," +
                product.expire_date +
                "," +
                addSlashes(product_volumes.volumes) +
                "," +
                addSlashes(product_volumes.prices) +
                "," +
                addSlashes(product_volumes.discounts) +
                "," +
                product.batch_code +
                "," +
                product.nozzle_id;

            var obj = {
                fileName: product.nozzle_id,
                fileData: fileData,
            };
            return obj;

        }

        socket.on("SYNC_ALL_DETAILS", function (param) {
            callSyncAllApi(machine_id, token, function (response) {

                console.log("RESPONSE");
                console.log(response);

                if (response.listOfNozzleConfig != null) {
                    response.listOfNozzleConfig.forEach((product) => {
                        var obj = getProductDetailsFromResponse("fromAll", product);
                        deleteAllFiles();
                        writeFile(obj);
                    })
                    io.sockets.emit("SYNC_ALL_DETAILS", true);
                } else {
                    io.sockets.emit("SYNC_ALL_DETAILS", false);
                }
            });

        });

        socket.on("SYNC_KEG_DETAILS", function (barcodeID) {
            barcodeValue = barcodeID;
            callKegApi(machine_id, barcodeID, token, function (response) {
                console.log(response)

                if (response.product != null) {
                    id_batch = response.product.id_batch;
                    if (response.isSuccess) {
                        var obj = getProductDetailsFromResponse("fromKeg", response);
                        io.sockets.emit("SYNC_KEG_DETAILS", obj);
                    } else {
                        io.sockets.emit("SYNC_KEG_DETAILS", null);
                    }
                } else {
                    io.sockets.emit("SYNC_KEG_DETAILS", null);
                }

            });
        });

        socket.on("SAVE_KEG_DETAILS", function (nozzelID) {
            callSaveKegDetailsApi(machine_id, nozzelID, id_batch, token, function (response) {
                io.sockets.emit("SAVE_KEG_DETAILS", response);
            });
        });

        socket.on("FROM_WEB_TO_BARCODE", function (data) {
            io.sockets.emit("TO_BARCODE", data);
        });

        socket.on("FROM_BARCODE", function (data) {
            //  console.log("BARCODE DATAAAAAAAAAAAAAAAAAAAA")
            console.log(data);
            io.sockets.emit("BARCODE_VALUE", data);
        });

        socket.on("WIFI_CONNECT", function (data) {
            var isSuccess = false;
            var ssid = data.split(" ")[0];
            var pass = data.split(" ")[1];
            console.log("connecting.....");
            /* Node wifi */
            wifi.connect({
                ssid: ssid,
                password: pass
            }, function (err) {
                if (err) {
                    console.log(err);
                } else {
                    console.log("Connected");
                    isSuccess = true;
                }
                console.log("okkkkkkkk" + isSuccess);
                socket.emit("WIFI_CONNECT", isSuccess);
            });

            /* Rpi wifi */
            // wifi.connect({ssid:ssid, psk:pass}).then(() => {
            //   isSuccess = true
            //   console.log("okkkkkkkk" + isSuccess);
            //   socket.emit("WIFI_CONNECT", isSuccess);
            //   })
            //   .catch((error) => {
            //     console.log(error);
            //     socket.emit("WIFI_CONNECT", false);
            //   });
            console.log("data received" + data);
        });

        socket.on("PRINTER_STATUS", function (data) {
            socket.emit("PRINTER_STATUS", printerStatus);
            console.log("printer status is = " + printerStatus);
        });

        socket.on("PRINT_TICKET", function(data) {
            var date = data["date"].split(" ")[0];
            var time = data["date"].split(" ")[1];
            var productName = data["productName"];
            var productPrice = data["price"];
            var productQuantity = data["quantity"];
            var barcode = data["barcode"];
            var plastic = data["plastic"];
            var belowCode = data["belowCode"];
            var batchCode = data["batchCode"];
            console.log(data);
            printTicket(
                "PRINTER,print," +
                date +
                "," +
                time +
                "," +
                productName.replace(/\s/g, '_') +
                "," +
                productPrice +
                "," +
                productQuantity +
                "," +
                barcode +
                "," +
                plastic +
                "," +
                belowCode +
                "," +
                batchCode
            );
            // testPrint();
        });

        function deleteAllFiles() {
            try {
                const fileFolder = "./files/";
                fs.readdirSync(fileFolder).forEach((file) => {
                    fs.unlinkSync("files/" + file);
                    console.log("DONEEEEEEEEEEEE");
                });
            } catch (error) {
                console.log(error);
            }
        }

        function writeFile(data) {
            setTimeout(function () {
                fs.writeFile(
                    "files/" + data["fileName"] + ".txt",
                    data["fileData"],
                    function (err) {
                        if (err) throw err;
                        console.log("Saved!");
                    }
                );
            }, 100);
        }

        socket.on("WRITE_FILE", function (data) {
            console.log("data received " + data["fileName"] + " " + data["fileData"]);
            writeFile(data);
            setTimeout(() => {
                socket.emit("FILE_DETAILS", readAll());
            }, 1000);
        });


        socket.on("WRITE_LOG_FILE", function (data) {
            console.log(data);
            writeLogFile(data);
        });

        socket.on("SERIAL_DATA", function (data) {
            serialDataSend = data;
            socket.emit("SERIAL_DATA", serialDataReceived);
        });

        ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

        socket.on('maxAmt', (maxAmt) => {
            maxAmtx = maxAmt;
            console.log("maxAmt:", maxAmtx);
        });

        socket.on('Done', () => {
            reset();
        });

        socket.on('Page', (page) => {
            pageState = page;
            socket.emit('Status', {
                "page": page
            });
        });
    });

    device.on('error', (error) => {
        io.emit('Status', {
            "error": error
        });
    });

    device.on('powerup', function () {
        io.emit('Status', {
            "status": 'Device power up'
        });
    });

    device.on('reset', function () {
        io.emit('Status', {
            "status": 'Device reset'
        });
    });

    device.on('initialize', () => {
        io.emit('Status', {
            "status": "Device initialize"
        });
    });

    device.on("idling", () => {
        io.emit('Status', {
            "status": "Device on idle state"
        });
    });

    device.on('cassetteRemoved', () => {
        reset();
        io.emit('Status', {
            "error": "Cassette removed"
        });
    });

    device.on('cassetteFull', () => {
        io.emit('Status', {
            "error": "Cassette full"
        });
    });

    device.on('hold', () => {
        io.emit('Status', {
            "error": "Device on hold"
        });
    });

    device.on('returned', (cash) => {
        console.log("Returned", cash.amount);
    });

    device.on('accepting', async () => {
        console.log('accepting');
    });

    device.on('escrow', async (cash) => {
        total = getTotal(cash.amount);
        try {
            if (total > maxAmtx) {
                total = total - cash.amount;
                await device.retrieve();
            }
            else {
                await device.stack();

                /* Emit current total amount */
                io.emit('Total', total);
                /* Emit available refill voulume */
                io.emit('Refill', total);
                /* Emit stacked amount */
                io.emit('Amount', cash.amount);
            }
        } catch (error) {
            io.emit('Status', {
                "error": error.message
            });
        }
    });

    device.on('stacked', (cash) => {
        io.emit('stacked');
        try {
            io.emit('Status', {
                "status": `Stacked ${cash.amount} Rs`
            });
        } catch (error) {
            io.emit('Status', {
                "error": error.message
            });
        }
    });

})();

function writeLogFile(data) {
    console.log(data);
    var logData =
        data.time +
        "," +
        data.nozzleId +
        "," +
        data.productId +
        "," +
        data.productVolume +
        "," +
        data.netPrice;

    const replacer = new RegExp(":", 'g')
    var fileName = data.time.replace(replacer, '-')
    console.log("FILE NAME: " + fileName);
    setTimeout(function () {
        fs.writeFile(
            "log/" + fileName + ".txt",
            logData,
            function (err) {
                if (err) throw err;
                console.log("Saved!");
            }
        );
    }, 100);
}

function printerStatusReturn(data) {
    data = 0
    console.log("printer status returend" + data);
    console.log("previous " + previousPrinterStatus);
    console.log("latest " + printerStatus);
    if (data != printerStatus) {
        console.log("count" + statusCount);
        if (statusCount > 1) {
            previousPrinterStatus = printerStatus;
            printerStatus = data;
            io.sockets.emit("PRINTER_STATUS", printerStatus);
            console.log("status sent");
            if (printerStatus == 0) {
                console.log("test print done");
                testPrint();
            }
            statusCount = 0;
        }
        statusCount = statusCount + 1;
    } else {
        statusCount = 0;
    }
}

function sendAll() {
    var fileDataList = readLogFile();
    fileDataList.forEach((fileObj) => {
        console.log(fileObj);
        callTransactionApi(machine_id, fileObj, token, function (response) {
            console.log(response);
            if (response.isSuccess) {
                try {
                    fs.unlinkSync("log/" + fileObj.fileName);
                    console.log("DONEEEEEEEEEEEE");
                } catch (error) {
                    console.log(error);
                }
            }
        });
    });
}

function readAll() {
    sendAll();
    try {
        productDataList = [];
        const fileFolder = "./files/";
        fs.readdirSync(fileFolder).forEach((file) => {
            console.log(file);
            var fileData = readTextFile("files/", file);
            obj = {
                fileName: file.split(".")[0],
                productId: fileData.split(",")[0],
                productName: fileData.split(",")[1],
                productRemaining: fileData.split(",")[2],
                productRFD: fileData.split(",")[3],
                productMFD: fileData.split(",")[4],
                productEXD: fileData.split(",")[5],
                productVolumes: fileData.split(",")[6],
                productPrices: fileData.split(",")[7],
                productDiscounts: fileData.split(",")[8],
                batchNo: fileData.split(",")[9],
                nozzleNumber: fileData.split(",")[10],
            };
            productDataList.push(obj);
        });

    } catch (err) {
        console.log("File error");
    }

    productDataList.forEach(function (item, index, array) {
        console.log(item, index);
    });
    return productDataList;
}

function readTextFile(path, file) {
    try {
        var data = fs.readFileSync(path + file, "utf8");
        console.log(data.toString());
        return data.toString();
    } catch (err) {
        console.log("File error");
    }
}

function readLogFile() {
    var logDataList = [];
    try {
        const fileFolder = "./log/";
        fs.readdirSync(fileFolder).forEach((file) => {
            console.log("eeeeeeeeeeeeeeeeee");
            var fileData = readTextFile("log/", file);
            obj = {
                fileName: file,
                time: fileData.split(",")[0],
                nozzleId: fileData.split(",")[1],
                productId: fileData.split(",")[2],
                productVolume: fileData.split(",")[3],
                netPrice: fileData.split(",")[4],
            };
            logDataList.push(obj);
        });
    } catch (err) {
        console.log("File error");
    }
    return logDataList;
}