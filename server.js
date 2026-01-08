// server.js (접속자 목록 지원 버전)

const WebSocket = require('ws');
const PORT = process.env.PORT || 8080; 

const wss = new WebSocket.Server({ port: PORT });
console.log(`WebSocket Server is running on port ${PORT}`);

const rooms = {}; 

/**
 * 특정 방의 접속자 목록을 정리하여 브로드캐스팅하는 함수
 * @param {string} roomId - 메시지를 보낼 방 ID
 */
function broadcastUserList(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // 현재 방에 있는 클라이언트들의 닉네임과 스타일 정보를 배열로 정리
    const users = Array.from(room.clients)
        .filter(client => client.readyState === WebSocket.OPEN && client.nickname)
        .map(client => ({
            nickname: client.nickname,
            // 💡 닉네임에 적용된 스타일 정보도 함께 전송 (색상 표시용)
            style: client.style || null
        }));

    const jsonMessage = JSON.stringify({ 
        type: 'user_list', 
        users: users 
    });

    // 목록을 모든 접속자에게 전송
    room.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(jsonMessage);
        }
    });
}

wss.on('connection', function connection(ws) {
    ws.roomId = null; 
    ws.style = null; 
    ws.nickname = null;

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

            if (!room || (room && (!room.password || room.password === password))) {
                if (!room) {
                    room = { password: password || null, clients: new Set() };
                    rooms[roomId] = room;
                }
                
                ws.roomId = roomId;
                ws.style = style;
                ws.nickname = nickname;
                room.clients.add(ws);

                const sysMsg = `[시스템] ${nickname} 님이 접속했습니다.`;
                broadcast(roomId, sysMsg, { isSystem: true }); 
                
                // 💡 접속 후, 반드시 접속자 목록을 갱신합니다.
                broadcastUserList(roomId);
                
                return ws.send(JSON.stringify({ type: 'join_success', message: '성공적으로 접속했습니다.' }));
            } 
            else {
                return ws.send(JSON.stringify({ type: 'error', message: '비밀번호가 일치하지 않아 방에 입장할 수 없습니다.' }));
            }
        }
        
        // 2. 닉네임 업데이트 요청 처리 (update_nickname)
        else if (type === 'update_nickname' && ws.roomId) {
            const { oldNickname, newNickname, style } = payload;
            
            ws.nickname = newNickname;
            ws.style = style; // 💡 닉네임 변경 시 스타일도 함께 갱신될 수 있도록 처리
            
            const sysMsg = `[시스템] ${oldNickname} 님이 ${newNickname}(으)로 닉네임을 변경했습니다.`;
            broadcast(ws.roomId, sysMsg, { isSystem: true });
            
            // 💡 닉네임 변경 후, 반드시 접속자 목록을 갱신합니다.
            broadcastUserList(ws.roomId);
        }
        
        // 3. 스타일 업데이트 요청 처리 (update_style)
        else if (type === 'update_style' && ws.roomId) {
            const { style } = payload;
            ws.style = style; 
            // 💡 스타일 변경 후, 반드시 접속자 목록을 갱신합니다. (목록 색상 변경을 위해)
            broadcastUserList(ws.roomId);
        }

        // 4. 일반 채팅 메시지 처리 (chat)
        else if (type === 'chat' && ws.roomId) {
            const { nickname, text, style } = payload;
            const chatMsg = `${nickname}: ${text}`;
            broadcast(ws.roomId, chatMsg, { style: style });
        }
    });

    ws.on('close', () => {
        if (ws.roomId && rooms[ws.roomId]) {
            const room = rooms[ws.roomId];
            const leftNickname = ws.nickname;
            room.clients.delete(ws);
            
            if (room.clients.size === 0) {
                delete rooms[ws.roomId];
            } else {
                 // 💡 퇴장 시 알림 및 목록 갱신
                 if (leftNickname) {
                    broadcast(ws.roomId, `[시스템] ${leftNickname} 님이 퇴장했습니다.`, { isSystem: true });
                 }
                 broadcastUserList(ws.roomId);
            }
        }
    });
});

/**
 * 일반 채팅 메시지 브로드캐스팅 함수 (기존과 동일)
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