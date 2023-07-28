const socket = io();

const myVideo = document.getElementById("myVideo");
const audioBtn = document.getElementById("audio");
const cameraBtn = document.getElementById("camera");
const cameraSelect = document.getElementById("cameraSelect");
const messages = document.getElementById("messages");
const chatForm = document.getElementById("chat");

const waitRoom = document.getElementById("waitRoom");
const waitRoomForm = waitRoom.querySelector("form");

const callRoom = document.getElementById("callRoom");

// callRoom.hidden = true;
callRoom.style.display = "none";

let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let nickname;
let myPeerConnection;
let myDataChannel;

// 클라이언트 단(웹 브라우저)

// 마이크 및 웹켐등의 정보 받기
async function getMedia() {
  try {
    myStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });
    // myVideo에 미디어(마이크, 카메라) 객체를 설정
    myVideo.srcObject = myStream;
    await getCamera();
  } catch (e) {
    console.log(e);
  }
}
//카메라 목록을 불러오는 함수(내가 사용하고자 하는 카메라를 설정하기 위함)
async function getCamera() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    // 가져온 미디어 입출력 장치 목록 중 비디오(카메라)와 관련된 정보만 분류하여 저장
    const cameras = devices.filter((device) => device.kind === "videoinput");

    //카메라 목록창을 생성
    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;
      option.innerText = camera.label;
      cameraSelect.appendChild(option);
    });
  } catch (e) {
    console.log(e);
  }
}
// mute와 unmute 설정
function handleAudioClick() {
  myStream
    .getAudioTracks()
    .forEach((track) => (track.enabled = !track.enabled));

  if (!muted) {
    audioBtn.innerText = "음소거 풀기";
  } else {
    audioBtn.innerText = "음소거 하기";
  }
  muted = !muted;
}

// camera on off 설정
function handleCameraClick() {
  myStream
    .getVideoTracks()
    .forEach((track) => (track.enabled = !track.enabled));
  if (!cameraOff) {
    cameraBtn.innerText = "카메라 켜기";
  } else {
    cameraBtn.innerText = "카메라 끄기";
  }
  cameraOff = !cameraOff;
}

// 카메라 변경을 위한 함수
async function handleCameraChange() {
  await getMedia();

  if (myPeerConnection) {
    const newVideoTrack = myStream.getVideoTracks()[0]; //변경하기 위해 선택한 카메라
    const videoSender = myPeerConnection // 전송할 영상 인풋 데이터 정보 변경
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(newVideoTrack);
  }
}
// mute, camera trun off, camera change 버튼 이벤트
audioBtn.addEventListener("click", handleAudioClick);
cameraBtn.addEventListener("click", handleCameraClick);
cameraSelect.addEventListener("change", handleCameraChange);

// --------------- wait room form (choose and enter a room) -----------------
// 들어간 방을 보여줌
function showRoom() {
  waitRoom.style.display = "none";

  callRoom.hidden = false;
  callRoom.style.display = "flex";
}

// 방 접속시 방 입장, 인풋장비, 닉네임 등을 관리 및 설정
async function handleRoomSubmit(e) {
  e.preventDefault();

  // 카메라, 마이크 장치 연결 설정
  await initCall();

  // 닉네임 설정
  const nicknameInput = waitRoom.querySelector("#nickname");
  socket.emit("set_nickname", nicknameInput.value);

  // 채팅방 입장
  const roomNameInput = waitRoom.querySelector("#roomName");
  socket.emit("enter_room", roomNameInput.value, showRoom);

  roomName = roomNameInput.value;
  nickname = nicknameInput.value;
}

async function initCall() {
  // waitRoom.style.display = "none";
  // // waitRoom.hidden = true;
  // callRoom.hidden = false;
  // callRoom.style.display = "flex";
  await getMedia();
  makeConnection();
}
// 방 들어가기전 버튼 클릭 시 submit 발생을 감지하여 '방 접속' 함수 실행
waitRoomForm.addEventListener("submit", handleRoomSubmit);

// --------- Socket Code ----------

socket.on("welcome", async () => {
  // RTC 통신에 채팅을 위한 데이터 채널을 생성함
  myDataChannel = myPeerConnection.createDataChannel("chat");
  myDataChannel.addEventListener("message", addMessage);

  // webrtc 통신을 위해 
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  socket.emit("send_offer", offer, roomName);
});

socket.on("receive_offer", async (offer) => {
  myPeerConnection.addEventListener("datachannel", (e) => {
    myDataChannel = e.channel;
    myDataChannel.addEventListener("message", addMessage);
  });
  myPeerConnection.setRemoteDescription(offer);

  // getMedia
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("send_answer", answer, roomName);
});

socket.on("receive_answer", (answer) => {
  myPeerConnection.setRemoteDescription(answer);
});

// 전달받은 ice candidate(네트워크 정보 ip, protocal, port 등등)을 받아서
// RTC 통신을 하기 위해 저장
socket.on("receive_ice", (ice) => {
  myPeerConnection.addIceCandidate(ice);
});

// --------- RTC Code ---------

function handleIce(data) {
  // 방정보와 ice를 담아 전송함
  socket.emit("send_ice", data.candidate, roomName);
}

function handleAddStream(data) {
  const peerVideo = document.getElementById("peerVideo");
  peerVideo.srcObject = data.stream;
}

// WEB-RTC 커넥션을 연결(1대1 p2p)
function makeConnection() {
  // 브러우저간의 연결을 설정하기위해 RTC연결 객체 생성
  myPeerConnection = new RTCPeerConnection();
  // 네트워크 정보를 저장, 설정 하고
  myPeerConnection.addEventListener("icecandidate", handleIce);

  // "addstream" event
  // 영상정보및 음성정보를 보내기 위해 설정
  myPeerConnection.addEventListener("addstream", handleAddStream);

  myStream
    .getTracks()
    .forEach((track) => myPeerConnection.addTrack(track, myStream));
}

// --------- Data Channel Code ---------

// 채팅 입력시 채팅 메시지를 li 태그에 넣어서 보여줌
function addMessage(e) {
  const li = document.createElement("li");
  li.innerHTML = e.data;
  messages.append(li);
  messages.scrollTop = messages.scrollHeight;
}

// 전송 시 상대방이 보낸거면 닉네임: 메시지 내가 보낸거면 나: 메시지
function handleChatSubmit(e) {
  e.preventDefault();
  const input = chatForm.querySelector("input");
  myDataChannel.send(`${nickname}: ${input.value}`);
  addMessage({ data: `Me: ${input.value}` });
  input.value = "";
}

chatForm.addEventListener("submit", handleChatSubmit);


