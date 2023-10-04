require('./index');
const http = require("http");

const host = 'localhost';
const port = 8000;

const requestListener = function(req, res) {
    res.writeHead(200);
    const ICS = require('fs').readFileSync('ICS/meetings.ics', 'utf8');
    res.end(ICS);
}

const server = http.createServer(requestListener);
server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});

console.log("Server started");