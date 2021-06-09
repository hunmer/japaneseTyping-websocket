var express = require('express');
var http = require('http');
var WebSocket = require('ws');

var app = express();
app.use(express.static(__dirname));

var server = http.createServer(app);
var wss = new WebSocket.Server({server});

var logs = {};
var rooms = {};
var contents = {};
wss.on('connection', function connection(ws) {
    ws.on('message', function incoming(msg) {
        var data = JSON.parse(msg);
        console.log("revice : ", data);
        var sendToRoom;
        if(!data) return;
        switch (data.type) {
            case 'getRooms':
                var room;
                var ret = {};
                for(var id in rooms){
                    room = rooms[id];
                    ret[id] = {
                        name: room.name,
                        owner: room.owner,
                        players: room.players.length,
                        maxPlayer: room.maxPlayer,
                    }
                }
                return sendJson(ws, {type: 'rooms',  rooms: ret});

            case 'getRoomIdByName':
                var key = getRoomIdBy('name', data.search);
                if(key) sendJson(ws, {type: 'joinRoom',  id: key});
                return;

             case 'getRoomIdByOwner':
                var key = getRoomIdBy('owner', data.search);
                if(key) sendJson(ws, {type: 'joinRoom',  id: key});
                return;

            case 'list':
                var ret = {};
                for(var name in logs){
                    if(logs[name].room == data.id){
                        ret[name] = logs[name];
                    }
                }
                return sendJson(ws, {type: 'list', list: ret});

            case 'getContent':
                return sendJson(ws, contents[data.id] ? {type: 'setContent', title: contents[data.id].title, content: contents[data.id].content} : sendJson(ws, {type: 'tip', color: 'error',title: '获取失败', msg: '没有内容.'}));

        	case 'broadcast':
        	case 'status':
        	case 'msg':
            case 'enableRoom':
            case 'iconMove':
            case 'roomSetting':
            case 'setContent':
            case 'getRoomSetting':
        		switch(data.type){

                    // 开关房间
                    case 'enableRoom':
                        if(data.enable){
                            if(rooms[data.id] != undefined){
                                return sendJson(ws, {type: 'tip', color: 'error',title: '开启失败', msg: '此房间早已开启.'});
                            }
                            createRoom(ws, data)
                            // 更新房间列表
                            return sendJson(ws, {type: 'tip',  color: 'success', title: '开启成功',msg: '房间启动成功.'});
                        }

                        if(rooms[data.id] == undefined){
                            return sendJson(ws, {type: 'tip', color: 'error', title: '关闭失败', msg: '此房间未开启.'});
                        }
                        delete rooms[data.id];
                        // 更新房间列表
                        return sendJson(ws, {type: 'tip',  color: 'success', title: '关闭成功', msg: '房间关闭成功.'});

                    // 更新房间设置
                    case 'roomSetting':
                    case 'setContent':
                        if(rooms[data.id] != undefined){
                            if(rooms[data.id].key != data.key){
                                return sendJson(ws, {type: 'tip', color: 'error',title: '设置失败', msg: '你没有权限更改.'});
                            }
                            switch(data.type){
                                case 'setContent':
                                    contents[data.id] = {
                                        title: data.title,
                                        content: data.content
                                    }
                                    break;

                                case 'roomSetting':
                                    rooms[data.id] = Object.assign(data, rooms[data.id]);
                                    sendJson(ws, {type: 'tip',  color: 'success', title: '更新成功', msg: '房间信息更新成功.'});
                                    break;

                            }
                            // 移除
                            delete data.key;
                            msg = JSON.stringify(data);
                            sendToRoom = data.id;
                        }
                        break;

                    case 'getRoomSetting':
                        var name;
                        if(g_uuid.indexOf(data.id) == -1){
                            name = data.id;
                            data.id = getRoomIdBy('name', data.id);
                        }

                        var exists = rooms[data.id] != undefined;
                        if(!exists){
                            data.id = createRoom(ws, data, name);
                            //return sendJson(ws, {type: 'tip', color: 'error', title: '查询失败', msg: '此房间未开启.'});
                        }else{
                            if(rooms[data.id].password != undefined){
                                if(data.password == undefined){
                                    // 请求输入密码
                                    return sendJson(ws, {type: 'input', type1: 'roomPassword'});
                                }
                                if(data.password != rooms[data.id].password){
                                    return sendJson(ws, {type: 'tip', color: 'error',title: '加入失败', msg: '密码错误.'});
                                }
                            }
                            if(rooms[data.id].closeAt){
                                delete rooms[data.id].closeAt;
                            }
                        }
                        // 首次加入
                        if(rooms[data.id].players.indexOf(data.username) == -1){
                            if(rooms[data.id].players.length >= rooms[data.id].maxPlayer){
                                    return sendJson(ws, {type: 'tip', color: 'error',title: '加入失败', msg: '人数已满.'});
                            }
                            rooms[data.id].players.push(data.username);
                        }

                        // login
                        logs[data.username] = {
                            name: data.username,
                            status: 'Online',
                            class: 'badge-primary',
                            img: data.img || './img/'+data.username+'.jpg',
                            room: data.id,
                        };
                        ws._username = data.username;
                        sendJson(ws, {type: 'list', list: logs});
                        sendJson(ws, Object.assign({type: 'roomSetting'}, rooms[data.id]));
                        return broadcastMsg({type: 'join',  username: data.username, id: data.id}, data.id);
        		}
                broadcastMsg(msg, sendToRoom);
        		break;

        	default:
        		break;
        }
        
    });
});


function getRoomIdBy(searchIndex, searchValue){
    for(var key in rooms){
        if(rooms[key][searchIndex] == searchValue){
            return key;
        }
    }
}

function createRoom(ws, data, name){
    var id = uuid();
    rooms[id] = {
        name: name || (data.username + '‘s room'),
        owner: data.username,
        password: data.password,
        players: [data.username],
        maxPlayer: data.maxPlayer,
        // bgImg: './img/bg.jpg',
        key: uuid(),
    }
    contents[id] = {
        title: 'title',
        content: 'some text',
    }
    console.log(rooms[id]);
    sendJson(ws, {type: 'roomKey',  id: id, key: rooms[id].key});
    return id;
}

function sendJson(ws, data){
    var row = JSON.stringify(data);
    console.log("send: " + row);
    ws.send(row);

}

var g_uuid = [];
function uuid() {
    while(true){
        var s = [];
        var hexDigits = "0123456789abcdef";
        for (var i = 0; i < 36; i++) {
            s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
        }
        s[14] = "4"; 
        s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1); 
        s[8] = s[13] = s[18] = s[23] = "-";
        var uuid = s.join("");
        if(g_uuid.indexOf(uuid) == -1){
            break;
        }
    }
    g_uuid.push(uuid);
    return uuid;
}

function broadcastMsg(msg, room, out_client){
    if(typeof(msg) == 'object') msg = JSON.stringify(msg);
    wss.clients.forEach(function each(client) {
        if(room != undefined && logs[client._username] && logs[client._username].room != room){
        }else{
            if(client != out_client) client.send(msg);
        }
    });
}

const interval = setInterval(function ping() {
	var names = [];
	wss.clients.forEach(function each(ws) {
	  	names.push(ws._username);
	});
	for(let name in logs){
		if(names.indexOf(name) == -1){
			console.log(name+'断开连接!');
            broadcastMsg({type: 'list', list: JSON.stringify(logs)});

            for(var index in rooms){
                var i = rooms[index].players.indexOf(name);
                if(i != -1){
                    rooms[index].players.splice(i, 1);
                }
            }

			delete logs[name];
		}
	}

    for(var index in rooms){
        if(rooms[index].players.length == 0){
            var now = parseInt(new Date().getTime() / 1000);
            if(rooms[index].closeAt == undefined){
                rooms[index].closeAt = now + 5;
            }else
            if(now >= rooms[index].closeAt){
                 console.log('自动关闭房间 ' + rooms[index].name);
                 delete rooms[index];
            }
        }
    }
}, 3000);

wss.on('close', function close() {
  clearInterval(interval);
});

server.listen(8000, function listening() {
    console.log('服务器启动成功！');
});