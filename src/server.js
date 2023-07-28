import https from "https";
import SocketIO from "socket.io";
import express from "express";
import fs from "fs";

// 서버 단(nodejs)

const app = express(); // express 웹 프레임워크 사용

//htpps 사용을 위해 openssl을 통해 발급 받은 키 경로 설정
var options = {
  key: fs.readFileSync('./server.key'),
  cert: fs.readFileSync('./server.crt'),
  ca: fs.readFileSync('./server.csr'),
};

app.set("view engine", "pug"); //사용할 웹 뷰 엔진 (ejs 또는 pug를 주로 사용함)
app.set("views", __dirname + "/views"); // 웹페이지 디렉토리 경로 설정
app.use("/public", express.static(__dirname + "/public")); // static(정적) 파일 경로 설정
app.get("/", (_, res) => res.render("home")); // url 경로 설정
app.get("/*", (_, res) => res.redirect("/")); // 모든 url 경로를 / 경로로 변경

//https 서버 생성
const httpsServer = https.createServer(options, app); 
// websocket 서버 생성
const wsServer = SocketIO(httpsServer);

// 브라우저와 서버 연결시 발생되는 이벤트(.on 이벤트를 받는 것)
// 해당 위치에선 클라이언트 -> 서버
wsServer.on("connection", (socket) => {
  // 방 들어가기
  socket.on("enter_room", (roomName, done) => {
    //소켓에 룸 이름을 저장
    socket.join(roomName);
    // 방에 들어가는 함수 실행(서버가 브라우저한테 명령하여 브라우저에서 함수가 실행됨)
    done();
    // 해당 방에 welcome 이벤트 보냄(.emit 이벤트를 보내는 것)
    // 해당 위치에선 서버 -> 클라이언트
    socket.to(roomName).emit("welcome");
  });

  // 닉네임 설정
  socket.on("set_nickname", (nickname) => {
    socket["nickname"] = nickname;
  });
  //RTC 연결(시그널링)을 위한 초대장, 제안(offer)을 보냄
  socket.on("send_offer", (offer, roomName) => {
    socket.to(roomName).emit("receive_offer", offer);
  });
  // RTC 연결(시그널링)을 위한 초대장의 답장, 제안(offer)를 받은 브라우저가 응답한 데이터
  socket.on("send_answer", (answer, roomName) => {
    socket.to(roomName).emit("receive_answer", answer);
  });
  // 받은 ice(네트워크 정보)와 방정보 설정을 위한 통신
  // ice(Interactive Connectivity Establishment)란 
  // 브라우저간의 연결을 위해 중간장치들이 있는 환경에서도
  // 통신을 유지 및 신뢰 할 수 있게 만들어주는 기술(지도 또는 약도라고 이해하면 좋음)
  socket.on("send_ice", (ice, roomName) => {
    socket.to(roomName).emit("receive_ice", ice);
  });
});

const handleListen = () => console.log(`Listening on https://localhost:7000`);
httpsServer.listen(7000, handleListen); // 3000번 포트 사용
