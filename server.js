// server.js (개인 설정 실시간 변경 지원 버전)

const WebSocket = require('ws');
const PORT = process.env.PORT || 8080; 

const wss = new WebSocket.Server({ port: PORT });
console.log(`WebSocket Server is running on port ${PORT}`);

// 채팅방 정보 저장소
const rooms = {}; 

wss.on('connection', function connection(ws) {
    ws.roomId = null; 
    ws.style = null; // 사용자의 스타일 정보 저장

    ws.on('message', function incoming(message) {
        const receivedData = JSON.parse(message.toString());
        const { type, payload } = receivedData;

        // 1. 초기 접속 요청 처리 (join)
        if (type === 'join') {
            const { roomId, password, nickname, style } = payload; 

            // ... (기존 접속 로직 유지) ...

            let room = rooms[roomId];

            if (!roomId || !nickname) {
                return ws.send(JSON.stringify({ type: 'error', message: '방 ID와 닉네임은 필수입니다.' }));
            }

            // 1-1. 방 생성 또는 입장 성공 시
            if (!room || (room && (!room.password || room.password === password))) {
                if (!room) {
                    room = { password: password || null, clients: new Set() };
                    rooms[roomId] = room;
                }
                
                ws.roomId = roomId;
                ws.style = style; // 💡 사용자의 초기 스타일 정보 저장
                room.clients.add(ws);

                const sysMsg = `[시스템] ${nickname} 님이 접속했습니다.`;
                broadcast(roomId, sysMsg, { isSystem: true }); 
                
                return ws.send(JSON.stringify({ type: 'join_success', message: '성공적으로 접속했습니다.' }));
            } 
            // 1-2. 비밀번호 불일치
            else {
                return ws.send(JSON.stringify({ type: 'error', message: '비밀번호가 일치하지 않아 방에 입장할 수 없습니다.' }));
            }
        }
        
        // 💡 3. 스타일 업데이트 요청 처리 (update_style)
        else if (type === 'update_style' && ws.roomId) {
            const { style } = payload;
            // 서버의 WebSocket 객체에 최신 스타일만 업데이트
            ws.style = style; 
            // 시스템 메시지 브로드캐스트는 클라이언트에서 처리했으므로 서버는 저장만 합니다.
        }


        // 2. 일반 채팅 메시지 처리 (chat)
        else if (type === 'chat' && ws.roomId) {
            const { nickname, text, style } = payload;
            const chatMsg = `${nickname}: ${text}`;
            // 브로드캐스트 시 클라이언트가 보낸 최신 스타일 정보 사용
            broadcast(ws.roomId, chatMsg, { style: style });
        }
    });

    ws.on('close', () => {
        // ... (연결 해제 로직은 동일) ...
        if (ws.roomId && rooms[ws.roomId]) {
            const room = rooms[ws.roomId];
            room.clients.delete(ws);
            if (room.clients.size === 0) {
                delete rooms[ws.roomId];
            }
        }
    });
});

/**
 * 특정 방의 모든 클라이언트에게 메시지를 브로드캐스팅하는 함수
 */
function broadcast(roomId, message, options = {}) {
    const room = rooms[roomId];
    if (room) {
        const jsonMessage = JSON.stringify({ 
            type: 'chat', 
            text: message,
            style: options.style || null 
        });

        room.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(jsonMessage);
            }
        });
    }
}