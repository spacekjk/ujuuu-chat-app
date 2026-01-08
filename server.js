// server.js (업그레이드 버전)

const WebSocket = require('ws');
const PORT = process.env.PORT || 8080; 

const wss = new WebSocket.Server({ port: PORT });
console.log(`WebSocket Server is running on port ${PORT}`);

// 💡 새로운 기능: 채팅방 정보 저장소 (방 ID를 키로 사용)
// 각 방은 비밀번호와 해당 방에 접속된 클라이언트 목록(Set)을 가집니다.
const rooms = {}; 

wss.on('connection', function connection(ws) {
    console.log('새로운 클라이언트가 연결되었습니다!');

    // 클라이언트가 접속한 방 ID를 저장할 변수
    ws.roomId = null; 

    ws.on('message', function incoming(message) {
        const receivedData = JSON.parse(message.toString());
        const { type, payload } = receivedData;

        // 1. 초기 접속 요청 처리 (방 생성 또는 입장)
        if (type === 'join') {
            const { roomId, password, nickname } = payload;

            if (!roomId || !nickname) {
                return ws.send(JSON.stringify({ type: 'error', message: '방 ID와 닉네임은 필수입니다.' }));
            }

            let room = rooms[roomId];

            // 1-1. 방이 존재하지 않을 때: 새로운 방 생성
            if (!room) {
                // 방 생성 시 비밀번호 설정은 선택적
                room = { 
                    password: password || null, 
                    clients: new Set() 
                };
                rooms[roomId] = room;
                ws.roomId = roomId;
                room.clients.add(ws);

                const sysMsg = `[시스템] ${nickname} 님이 비밀번호 ${password ? '설정 후' : '없이'} 새로운 방(${roomId})을 생성하고 접속했습니다.`;
                broadcast(roomId, sysMsg);
                console.log(`방 생성됨: ${roomId}`);
            } 
            // 1-2. 방이 존재할 때: 기존 방 입장 시도
            else {
                // 비밀번호 확인
                if (room.password && room.password !== password) {
                    return ws.send(JSON.stringify({ type: 'error', message: '비밀번호가 일치하지 않아 방에 입장할 수 없습니다.' }));
                }

                ws.roomId = roomId;
                room.clients.add(ws);
                const sysMsg = `[시스템] ${nickname} 님이 방(${roomId})에 입장했습니다.`;
                broadcast(roomId, sysMsg);
                console.log(`방 접속: ${roomId}, 사용자: ${nickname}`);
            }
            
            // 연결 성공 메시지 전송
            ws.send(JSON.stringify({ type: 'join_success', message: '성공적으로 접속했습니다.' }));
        }

        // 2. 일반 채팅 메시지 처리
        else if (type === 'chat' && ws.roomId) {
            const { nickname, text } = payload;
            const chatMsg = `${nickname}: ${text}`;
            broadcast(ws.roomId, chatMsg);
        }
    });

    ws.on('close', () => {
        if (ws.roomId && rooms[ws.roomId]) {
            const room = rooms[ws.roomId];
            room.clients.delete(ws);
            console.log(`클라이언트 연결 해제: ${ws.roomId} 방`);
            
            // 방에 아무도 없으면 방 제거
            if (room.clients.size === 0) {
                delete rooms[ws.roomId];
                console.log(`방 제거됨: ${ws.roomId}`);
            } else {
                 // 남은 사용자들에게 퇴장 알림
                 // 💡 클라이언트 코드를 수정하지 않아 닉네임 정보를 여기서 알 수 없으므로, 닉네임 출력은 생략합니다.
                 // broadcast(ws.roomId, `[시스템] 어떤 사용자가 퇴장했습니다.`);
            }
        }
    });
});

/**
 * 특정 방의 모든 클라이언트에게 메시지를 브로드캐스팅하는 함수
 * @param {string} roomId - 메시지를 보낼 방 ID
 * @param {string} message - 보낼 메시지 (텍스트)
 */
function broadcast(roomId, message) {
    const room = rooms[roomId];
    if (room) {
        // 메시지를 JSON 문자열로 변환하여 전송합니다.
        const jsonMessage = JSON.stringify({ type: 'chat', text: message });
        room.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(jsonMessage);
            }
        });
    }
}