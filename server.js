// server.js (닉네임 실시간 변경 지원 버전)

const WebSocket = require('ws');
const PORT = process.env.PORT || 8080; 

const wss = new WebSocket.Server({ port: PORT });
console.log(`WebSocket Server is running on port ${PORT}`);

// 채팅방 정보 저장소
const rooms = {}; 

wss.on('connection', function connection(ws) {
    ws.roomId = null; 
    ws.style = null; 
    ws.nickname = null; // 💡 닉네임 저장을 위한 속성 추가

    ws.on('message', function incoming(message) {
        const receivedData = JSON.parse(message.toString());
        const { type, payload } = receivedData;

        // 1. 초기 접속 요청 처리 (join)
        if (type === 'join') {
            const { roomId, password, nickname, style } = payload; 

            if (!roomId || !nickname) {
                return ws.send(JSON.stringify({ type: 'error', message: '방 ID와 닉네임은 필수입니다.' }));
            }

            let room = rooms[roomId];

            // 방 생성 또는 입장 성공 시
            if (!room || (room && (!room.password || room.password === password))) {
                if (!room) {
                    room = { password: password || null, clients: new Set() };
                    rooms[roomId] = room;
                }
                
                ws.roomId = roomId;
                ws.style = style;
                ws.nickname = nickname; // 💡 닉네임 저장
                room.clients.add(ws);

                const sysMsg = `[시스템] ${nickname} 님이 접속했습니다.`;
                broadcast(roomId, sysMsg, { isSystem: true }); 
                
                return ws.send(JSON.stringify({ type: 'join_success', message: '성공적으로 접속했습니다.' }));
            } 
            // 비밀번호 불일치
            else {
                return ws.send(JSON.stringify({ type: 'error', message: '비밀번호가 일치하지 않아 방에 입장할 수 없습니다.' }));
            }
        }
        
        // 💡 3. 닉네임 업데이트 요청 처리 (update_nickname)
        else if (type === 'update_nickname' && ws.roomId) {
            const { oldNickname, newNickname } = payload;
            
            // 닉네임 중복 체크 (선택 사항: 현재는 허용함)
            
            // 1. 서버의 ws 객체 닉네임 업데이트
            ws.nickname = newNickname;
            
            // 2. 같은 방 사용자들에게 닉네임 변경 알림 브로드캐스팅
            const sysMsg = `[시스템] ${oldNickname} 님이 ${newNickname}(으)로 닉네임을 변경했습니다.`;
            broadcast(ws.roomId, sysMsg, { isSystem: true });
        }
        
        // 4. 스타일 업데이트 요청 처리 (update_style)
        else if (type === 'update_style' && ws.roomId) {
            const { style } = payload;
            ws.style = style; 
        }


        // 2. 일반 채팅 메시지 처리 (chat)
        else if (type === 'chat' && ws.roomId) {
            const { nickname, text, style } = payload;
            const chatMsg = `${nickname}: ${text}`;
            broadcast(ws.roomId, chatMsg, { style: style });
        }
    });

    ws.on('close', () => {
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