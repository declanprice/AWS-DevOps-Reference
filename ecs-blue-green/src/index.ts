import express from "express";

const app = express();

app.get("/", (req: any, res: any) => {
    return res.json({status: 'ok'});
})

app.listen(8080);

console.log('Listening on port 8080');