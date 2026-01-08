// server.js (개인 설정 지원 버전)

const WebSocket = require('ws');
const PORT = process.env.PORT || 8080; 

const wss = new WebSocket.Server({ port: PORT });
console.log(`WebSocket Server is running on port ${PORT}`);

// 채팅방 정보 저장소
const rooms = {}; 

wss.on('connection', function connection(ws) {
    ws.roomId = null; 
    // 💡 추가: 사용자의 스타일 정보 (접속 후 저장)
    ws.style = null; 

    ws.on('message', function incoming(message) {
        const receivedData = JSON.parse(message.toString());
        const { type, payload } = receivedData;

        // 1. 초기 접속 요청 처리 (방 생성 또는 입장)
        if (type === 'join') {
            const { roomId, password, nickname, style } = payload; // 💡 style 정보 추가

            if (!roomId || !nickname) {
                return ws.send(JSON.stringify({ type: 'error', message: '방 ID와 닉네임은 필수입니다.' }));
            }

            let room = rooms[roomId];

            // ... (방 생성/입장 로직은 동일) ...

            // 1-1. 방 생성 또는 입장 성공 시
            if (!room || (room && (!room.password || room.password === password))) {
                if (!room) {
                    room = { password: password || null, clients: new Set() };
                    rooms[roomId] = room;
                }
                
                ws.roomId = roomId;
                ws.style = style; // 💡 사용자의 스타일 정보 저장
                room.clients.add(ws);

                const sysMsg = `[시스템] ${nickname} 님이 접속했습니다.`;
                broadcast(roomId, sysMsg, { isSystem: true }); // 시스템 메시지 브로드캐스팅
                
                return ws.send(JSON.stringify({ type: 'join_success', message: '성공적으로 접속했습니다.' }));
            } 
            // 1-2. 비밀번호 불일치
            else {
                return ws.send(JSON.stringify({ type: 'error', message: '비밀번호가 일치하지 않아 방에 입장할 수 없습니다.' }));
            }
        }

        // 2. 일반 채팅 메시지 처리
        else if (type === 'chat' && ws.roomId) {
            const { nickname, text, style } = payload; // 💡 style 정보 추출
            const chatMsg = `${nickname}: ${text}`;
            // 💡 브로드캐스트 함수를 통해 스타일 정보 함께 전송
            broadcast(ws.roomId, chatMsg, { style: style });
        }
    });

    ws.on('close', () => {
        if (ws.roomId && rooms[ws.roomId]) {
            const room = rooms[ws.roomId];
            room.clients.delete(ws);
            // ... (방 제거 로직은 동일) ...
            if (room.clients.size === 0) {
                delete rooms[ws.roomId];
            }
        }
    });
});

/**
 * 특정 방의 모든 클라이언트에게 메시지를 브로드캐스팅하는 함수
 * @param {string} roomId - 메시지를 보낼 방 ID
 * @param {string} message - 보낼 메시지 (텍스트)
 * @param {object} options - 스타일 및 시스템 메시지 옵션
 */
function broadcast(roomId, message, options = {}) {
    const room = rooms[roomId];
    if (room) {
        // 클라이언트에게 전송할 최종 JSON 객체 구성
        const jsonMessage = JSON.stringify({ 
            type: 'chat', 
            text: message,
            // 💡 개인 설정 스타일 정보를 객체에 담아 전송
            style: options.style || null 
        });

        room.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(jsonMessage);
            }
        });
    }
}