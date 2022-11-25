var exec = require('child_process').exec;
var result = '';
var command;
var isPrinting = false;

setInterval(getPrinterStatus, 3000);

const execRun = (cmd) => {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                if (error.code === 1) {
                    console.log('e1')
                    resolve(stdout);
                } else {
                    // gitleaks error
                    console.log('e2')
                    reject(error);
                    execRun(cmd)
                }
            } else {
                // no leaks
                resolve(stdout);
            }
        })
    })
}

function getPrinterStatus() {
    result = "";
    child = exec('sudo msprintdemo 8', (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            if (!isPrinting) {
                printerStatusReturn(1);
            }
            return;
        }
        if (stderr) {
            console.log(stderr);
            return;
        }
        console.log(`stdout: ${stdout}`);
        console.log(stdout);
        if (!isPrinting) {
            printerStatusReturn(stdout);
        }
    });
}

function testPrint() {
    result = "";
    child = exec('sudo msprintdemo 2', (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            console.log('trying again');
            testPrint();
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
    });
}

function printTicket(data) {
    if (data != null) {
        console.log('++++++++++Serial Data: ' + data + "\n");
        isPrinting = true;

        console.log("ISPRINTING START");
        var serialText = data.split(",");
        if (serialText.includes("PRINTER", 0)) {
            command = serialText[1];
            if (command == "print") {
                var cmd = ("sudo msprintdemo 2 " + serialText[2] + " " + serialText[3] + " " + serialText[4] + " " + serialText[5] + " " + serialText[6] + " " + " " + serialText[7] + " " + serialText[8] + " " + serialText[9] + " " + serialText[10]);
                (async () => {
                    try {
                        const testing = await execRun(cmd)
                        console.log(testing)
                    } catch (e) {
                        console.log(e)
                    }
                })();

                console.log('print command seen');

            } else if (command == "status") {
                console.log('status command seen');
                result = "";
                child = exec('cd /home/pi/Documents/shampoo/Demo/ && sudo ./msprintdemo 8');

                child.stdout.on('data', function(data) {
                    result += data;
                });

                child.on('close', function() {
                    console.log('Child Command done: Result is....333');
                    console.log(result);
                    if (command == "status") {
                        if (result == 1) {
                            console.log("printer returned ERROR. Closing");
                        } else {
                            console.log("printer returned OK");
                        }
                    }
                });
            }
        }

        setTimeout(function() {
            console.log("ISPRINTING FINISH");
            isPrinting = false;
        }, 8000);
    }
};