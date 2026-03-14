const express = require('express')

const app = express()
const https = require('httpolyglot')
const fs = require('fs')
const mediasoup = require('mediasoup')
const mediasoupClient = require('mediasoup-client')
const config = require('./config')
const path = require('path')
const Room = require('./Room')
const Peer = require('./Peer')
const { Server } = require("socket.io");
const { verifyToken, bindTokenWithUUID, checkTokenExists } = require('./auth');

const options = {
  key: fs.readFileSync(path.join(__dirname, config.sslKey), 'utf-8'),
  cert: fs.readFileSync(path.join(__dirname, config.sslCrt), 'utf-8')
}

const httpsServer = https.createServer(options, app)
const io = new Server(httpsServer, {
  allowEIO3: true, // 兼容旧版 Engine.IO
  cors: { origin: "*" },
});

// app.use(express.static(path.join(__dirname, '..', 'public')))
// 允许所有来源访问（生产环境应限制为具体域名）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

httpsServer.listen(config.listenPort, () => {
  console.log('Listening on https://' + config.listenIp + ':' + config.listenPort)
})

// all mediasoup workers
let workers = []
let nextMediasoupWorkerIdx = 0

/**
 * roomList
 * {
 *  room_id: Room {
 *      id:
 *      router:
 *      peers: {
 *          id:,
 *          name:,
 *          master: [boolean],
 *          transports: [Map],
 *          producers: [Map],
 *          consumers: [Map],
 *          rtpCapabilities:
 *      }
 *  }
 * }
 */

// 定义消息类型枚举
const InfoType = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  USERS: 'users',
  USERJOIN: 'userJoin',
  USEREXIT: 'userExit',
  PRODUCERCREATE: 'producerCreate',
  CONSUMERCREATE: 'consumerCreated',
  CONSUMERUPDATE: 'consumerUpdate'
  // 可继续扩展其他类型
};
let roomList = new Map()
//人员List
let peopleList = new Map()


;(async () => {
  await createWorkers()
})()

async function createWorkers() {
  let { numWorkers } = config.mediasoup

  for (let i = 0; i < numWorkers; i++) {
    let worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.worker.logLevel,
      logTags: config.mediasoup.worker.logTags,
      rtcMinPort: config.mediasoup.worker.rtcMinPort,
      rtcMaxPort: config.mediasoup.worker.rtcMaxPort
    })

    worker.on('died', () => {
      console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid)
      setTimeout(() => process.exit(1), 2000)
    })
    workers.push(worker)
    // log worker resource usage
    /*setInterval(async () => {
            const usage = await worker.getResourceUsage();

            console.info('mediasoup Worker resource usage [pid:%d]: %o', worker.pid, usage);
        }, 120000);*/
  }
}

io.on('connection', async (socket) => {
  const auth = socket.handshake.auth;
  // const { token, machineUUID } = auth; // 从auth获取前端传递的machineUUID
  const { token } = auth; 
  const userId = auth.user?.id;
  const userName = auth.user?.name;
  
   // 1. 验证token存在性
   if (!token) {
    console.error("缺少token，断开连接");
    return socket.disconnect(true);
  }

  // 2. 验证token签名有效性
  const decodedToken = await verifyToken(token);
  if (!decodedToken) {
    console.error("无效的token，断开连接");
    return socket.disconnect(true);
  }

  // 3. 检查token是否已存在，首次使用则绑定UUID
  const tokenExists = await checkTokenExists(token);
  if (!tokenExists) {
    await bindTokenWithUUID(token);
    console.log(`Token首次使用，已绑定机器UUID`);
  } else {
    console.log(`Token已验证，绑定关系存在`);
  }

    // // 1. 验证必要参数存在性
    // if (!token || !machineUUID) {
    //   console.error("缺少token或机器UUID，断开连接");
    //   return socket.disconnect(true);
    // }
  
    // // 2. 验证token签名有效性
    // const decodedToken = await verifyToken(token);
    // if (!decodedToken) {
    //   console.error("无效的token，断开连接");
    //   return socket.disconnect(true);
    // }
  
    // // 3. 检查token是否已存在，首次使用则绑定UUID（使用前端传递的UUID）
    // const tokenExists = await checkTokenExists(token, machineUUID);
    // if (!tokenExists) {
    //   await bindTokenWithUUID(token, machineUUID);
    //   console.log(`Token首次使用，已绑定机器UUID: ${machineUUID}`);
    // } else {
    //   console.log(`Token已验证，绑定关系存在，机器UUID: ${machineUUID}`);
    // }

  // 4. 继续原有用户验证逻辑
  if (!userId || !userName) {
    console.error("缺少用户信息，断开连接");
    return socket.disconnect(true);
  }

  console.log(userId + "||" + userName + "已连接websocket…………");
  //1.链接即为加入。断开后需要处理
  // console.log("socket=>" , socket);
  // 验证用户信息
  if (!userId || !userName) {
    console.error("缺少用户信息，断开连接");
    socket.disconnect(true);
    return;
  }
  socket.userId = userId;
  socket.userName = userName;
  //2.放入peoplelist中，持久化数据

  peopleList.set(userId,auth.user);
  // let worker = await getMediasoupWorker();
  // const room = new Room(userId, worker, io);
  // console.error("room created");
  // roomList.set(userId, room)
  // await room.createRouter()
  // console.error("router created created");

  //3.广播给其他用户上线用户消息 
  // socket.broadcast.emit('/user/online', auth.user);//这个排除了自己
  // 获取所有已连接的 Socket 实例
  console.log("connection broadcast sockets");
  dispatchInfo(InfoType.ONLINE,auth);
  dispatchInfo(InfoType.USERS,peopleList);
 
  console.log("broadcast sockets done");


  //获取全部人员


  socket.on('createRoom', async ({ room_id }, callback) => {
    if (roomList.has(room_id)) {
      callback('already exists')
    } else {
      console.log('Created room', { room_id: room_id })
      let worker = await getMediasoupWorker()
      roomList.set(room_id, new Room(room_id, worker, io))
      socket.room_id = room_id;
      callback(room_id)
    }
  })


  //加入房间
  socket.on('join', ({ room_id, name }, cb) => {
    console.log('User joined', {
      room_id: room_id,
      name: name
    })

    if (!roomList.has(room_id)) {
      return cb({
        error: 'Room does not exist'
      })
    }

    roomList.get(room_id).addPeer(new Peer(socket.id, name))
    socket.room_id = room_id
    //用户加入监听，回传
    dispatchInfo(InfoType.USERJOIN,auth)

    cb(roomList.get(room_id).toJson())
  })

  // socket.on('getProducers', () => {
  //   if (!roomList.has(socket.room_id)) return
  //   console.log("socket.room_id==>" + socket.room_id);
  //   console.log('Get producers', { name: `${roomList.get(socket.room_id).getPeers().get(socket.id).name}` })

  //   // send all the current producer to newly joined member
  //   let producerList = roomList.get(socket.room_id).getProducerListForPeer()

  //   socket.emit('newProducers', producerList)
  // })

  // 服务器端 socket 事件处理
  socket.on('getProducers', (callback) => {
    if (!roomList.has(socket.room_id)) {
      console.warn(`房间不存在: ${socket.room_id}`);
      return callback([])
    }
    const room = roomList.get(socket.room_id)
    console.log('获取生产者Get producers', { 
      name: room.getPeers().get(socket.id).name,
      room_id: socket.room_id,
      socket: socket.id
    })
    console.log("0获取生产者" + JSON.stringify(room.getProducerListForPeer()));
    // 直接返回改造后的生产者列表
    callback(room.getProducerListForPeer())
    // socket.emit('newProducers', producerList)
  })

  socket.on('getProducerById', (producerId,callback) => {
    if (!roomList.has(socket.room_id)) {
      console.warn(`房间不存在: ${socket.room_id}`);
      return callback([])
    }
    const room = roomList.get(socket.room_id)
    console.log('Get producers', { 
      name: room.getPeers().get(socket.id).name 
    })
    // 直接返回改造后的生产者列表
    // callback(room.getProducerForPeer(producerId))
    // socket.emit('newProducers', producerList)
    const producer = room.getProducerForPeer(producerId);
    if (!producer) {
        console.warn(`Producer ${producerId} not found`);
        callback("没有找到"); // 明确返回 null 或错误
    } else {
        callback(producer); // 确保调用回调
    }
  })

  //des:获取路由器能力
  socket.on('getRouterRtpCapabilities', async (_, callback) => {
    try {
      const room = roomList.get(socket.room_id);
      if (!room) {
        throw new Error(`Room not found for user ${socket.room_id}`);
      }
  
      // 确保路由器已初始化
      if (!room.router) {
        await room.createRouter();
      }
      console.log("rtpCapabilities init");
      const rtpCapabilities = await room.getRtpCapabilities();
      callback(rtpCapabilities);
    } catch (e) {
      console.error("getRouterRtpCapabilities error:", e);
      callback({
        status: 'error',
        message: e.message
      });
    }
  })

  socket.on('createWebRtcTransport', async (_, callback) => {
    console.log('Create webrtc transport', {
      name: `${roomList.get(socket.room_id).getPeers().get(socket.id).name}`
    })

    try {
      const { params } = await roomList.get(socket.room_id).createWebRtcTransport(socket.id)

      callback(params)
    } catch (err) {
      console.error("error===>" + err)
      callback({
        error: err.message
      })
    }
  })

  socket.on('connectTransport', async ({ transport_id, dtlsParameters }, callback) => {
    console.log('Connect transport', { name: `${roomList.get(socket.room_id).getPeers().get(socket.id).name}` })

    if (!roomList.has(socket.room_id)) return
    await roomList.get(socket.room_id).connectPeerTransport(socket.id, transport_id, dtlsParameters)

    callback('success')
  })


  socket.on('exit', async ({}, callback) => {
      
  })


  //==========Publisher==========//

  socket.on('produce', async ({ kind, rtpParameters, producerTransportId, appData }, callback) => {
    if (!roomList.has(socket.room_id)) {
      return callback({ error: 'not is a room' })
    }
    console.log("1开始发布！");
    let producerBack = await roomList.get(socket.room_id).produce(socket.id, producerTransportId, rtpParameters, kind,appData);
    let returnId = producerBack.id
    console.log('Produce', {
      type: `${kind}`,
      name: `${roomList.get(socket.room_id).getPeers().get(socket.id).name}`,
      id: `${producerBack.id}`
    })
    console.log("producerBack",producerBack);

    // 构造 Conference.Media 数据
    const mediaDataMedia = {
        id: returnId,
        code:'',
        operator:'',
        media: {
          id: returnId,
          paused: false,
          kind: "audio" | "video",
          type: 'simple' | 'simulcast' | 'svc' | 'pipe',
          closed: false,
          layer: null,
          producerPaused: false,
          producerClosed: false,
          config: null
        },
        user: {
          id: appData.auth.user.id,
          name: appData.auth.user.name
        }
    };

    //监听创建生产者 
    dispatchInfo(InfoType.PRODUCERCREATE,mediaDataMedia);

    callback({
      producer_id: producerBack.id
    })
  })

  socket.on('pause', async ({channelId,producerId},callback) => {
    try{
      console.log("发布者暂停了发布流！");
      await roomList.get(socket.room_id).getPeers().get(socket.id).getProducer(producerId).pause();
      callback({ success: true }); // 通知客户端成功
    }catch (e) {
      console.log("发布者暂停了发布流！发生错误" + e.message);
      callback({ error: error.message }); // 通知客户端失败
    }
  })

  socket.on('resume', async ({channelId,producerId},callback) => {
    
    try{
      console.log("发布者继续了发布流！");
      await roomList.get(socket.room_id).getPeers().get(socket.id).getProducer(producerId).resume();


      console.log("onConsumerUpdated！");
      // 构造 Conference.Media 数据
      const mediaDataMedia = {
        id: '',
        code:'',
        operator:'',
        media: {
          id: '',
          paused: false,
          kind: "audio" | "video",
          type: 'simple' | 'simulcast' | 'svc' | 'pipe',
          closed: false,
          layer: null,
          producerPaused: false,
          producerClosed: false,
          config: null
        },
        user: {
          id: socket.userId, 
          name: socket.userName
        }
    };
    
    dispatchInfo(InfoType.CONSUMERUPDATE,mediaDataMedia);



      callback({ success: true }); // 通知客户端成功
    }catch (e) {
      console.log("发布者继续了发布流！发生错误" + e.message);
      callback({ error: error.message }); // 通知客户端失败
    }
  })

  socket.on('onConsumerUpdated', async ({channelId,producerId},callback) => {
    try{
      console.log("onConsumerUpdated！");
      dispatchInfo(InfoType.CONSUMERUPDATE,"");
      callback({ success: true }); // 通知客户端成功
    }catch (e) {
      console.log("发布者继续了发布流！发生错误" + e.message);
      callback({ error: error.message }); // 通知客户端失败
    }
  })


  //==========Subscriber==========//
  socket.on('consume', async ({ consumerTransportId, producerId, rtpCapabilities }, callback) => {
    //TODO null handling
    let params = await roomList.get(socket.room_id).consume(socket.id, consumerTransportId, producerId, rtpCapabilities)

    // console.log("consume---" + JSON.stringify(params));

    console.log('Consuming', {
      name: `${roomList.get(socket.room_id) && roomList.get(socket.room_id).getPeers().get(socket.id).name}`,
      producer_id: `${producerId}`,
      consumer_id: `${params.id}`
    })

    // 构造 Conference.Media 数据
    // const mediaDataMedia = {
    //     id: producerId,
    //     kind: params.kind,          // "audio" 或 "video"
    //     type: '',      // 根据实际需求填写 'simple' | 'simulcast' | 'svc' | 'pipe'
    //     closed: false,
    //     config: {}           // 可选，根据实际需求填写 kvData
    // };
        const mediaDataMedia = {
            id: producerId,
            code:'',
            operator:'',
            media: {
              id: producerId,
              paused: false,
              kind: "audio" | "video",
              type: 'simple' | 'simulcast' | 'svc' | 'pipe',
              closed: false,
              layer: null,
              producerPaused: false,
              producerClosed: false,
              config: null
            },
            user: {
              //改为生产者id与name
              // id: socket.userId, 
              // name: socket.userName
              id: params.appData.auth.user.id,
              name: params.appData.auth.user.name
            }
        };



    //用户监听创建消费者
    dispatchInfo(InfoType.CONSUMERCREATE,mediaDataMedia);


    dispatchInfo(InfoType.CONSUMERUPDATE,mediaDataMedia);

    callback(params)
  })

  // socket.on('resume', async (data, callback) => {
  //   await consumer.resume()
  //   callback()
  // })

  socket.on('getMyRoomInfo', (_, cb) => {
    cb(roomList.get(socket.room_id).toJson())
  })

  socket.on('disconnect', async () => {
    // console.log('Disconnect', {
    //   name: `${roomList.get(socket.room_id) && roomList.get(socket.room_id).getPeers().get(socket.id).name}`
    // })
    console.log('Disconnect', {name: `${socket.userName}`})

    if (!socket.userId) return
    // roomList.get(socket.room_id).removePeer(socket.id)
    peopleList.delete(socket.userId);
    //删除生产者
    // await roomList.get(socket.room_id).getPeers().get(socket.id).producers.delete(delete(producer.id));
    //退出群组
    dispatchInfo(InfoType.USEREXIT,auth);
    //用户下线
    dispatchInfo(InfoType.OFFLINE,auth);
    //通知所有人，返回在线用户列表
    dispatchInfo(InfoType.USERS,peopleList);
  
  })

  socket.on('producerClosed', ({ producer_id }) => {
    console.log('Producer close', {
      name: `${roomList.get(socket.room_id) && roomList.get(socket.room_id).getPeers().get(socket.id).name}`
    })

    roomList.get(socket.room_id).closeProducer(socket.id, producer_id)
  })

  socket.on('exitRoom', async (_, callback) => {
    console.log('Exit room', {
      name: `${roomList.get(socket.room_id) && roomList.get(socket.room_id).getPeers().get(socket.id).name}`
    })

    if (!roomList.has(socket.room_id)) {
      callback({
        error: 'not currently in a room'
      })
      return
    }
    // close transports
    await roomList.get(socket.room_id).removePeer(socket.id)
    if (roomList.get(socket.room_id).getPeers().size === 0) {
      roomList.delete(socket.room_id)
    }

    socket.room_id = null

    callback('successfully exited room')
  })
})

// async function dispatchInfo(type,auth) {
//   const sockets = await io.fetchSockets(); // Socket.IO v4+
  
//   const handler = messageHandlers[type] || messageHandlers.default;
//   //处理peoplelist
//   if(type == InfoType.USERS){
//     console.log("sockets.handler:" , handler);
//   }
//   sockets.forEach(client => {
//     const message = handler(client, auth);
//     client.emit('message', JSON.stringify(message));
//   });
// }

async function dispatchInfo(type, auth) {
  try {
    console.log("1.dispatchInfo-type" + type);
    // 边界判断：确保 io 实例存在且有 fetchSockets 方法
    if (!io || typeof io.fetchSockets !== 'function') {
      console.error('Socket.IO 实例未正确初始化');
      return;
    }
    
    const sockets = await io.fetchSockets();
    // 边界判断：确保 messageHandlers 存在
    if (!messageHandlers || typeof messageHandlers !== 'object') {
      console.error('消息处理函数集合未定义');
      return;
    }
    
    const handler = messageHandlers[type] || messageHandlers.default;
    // 边界判断：确保 handler 是函数
    if (typeof handler !== 'function') {
      console.error(`未找到类型为 ${type} 的有效消息处理函数`);
      return;
    }

    if (type === InfoType.USERS) {
      console.log("sockets.handler:", handler);
    }

    // 遍历并发送消息
    console.log("2.dispatchInfo-type--for");
    sockets.forEach(client => {
      try {
        const message = handler(client, auth);
        //  console.log("发送成功" + JSON.stringify(message));
        client.emit('message', JSON.stringify(message));
      } catch (error) {
        console.error(`向客户端 ${client.id} 发送消息失败:`, error);
      }
    });
  } catch (error) {
    console.error('分发信息时发生全局错误:', error);
  }
}

// 消息处理器映射表
const messageHandlers = {
  //用户上线
  [InfoType.ONLINE]: (client, auth) => ({
    topic: '/user/online',
    payload: auth.user
  }),
  //用户下线
  [InfoType.OFFLINE]: (client, auth) => ({
    topic: '/user/offline',
    payload: auth.user
  }),
  //所有用户
  [InfoType.USERS]: (client, auth) => ({
    topic: '/user/users',
    payload: Array.from(auth.values())
  }),

  //Conference -> Observer
  //用户加入
  [InfoType.USERJOIN]: (client, auth) => ({
    topic: '/conference/user/joined',
    payload: auth.user
  }),
  //用户退出
  [InfoType.USEREXIT]: (client, auth) => ({
    topic: '/conference/user/exited',
    payload: auth.user
  }),
  //生产者创建
  [InfoType.PRODUCERCREATE]: (client, auth) => ({
    topic: '/conference/producer/created',
    payload: auth
  }),
  //消费者创建
  [InfoType.CONSUMERCREATE]: (client, auth) => ({
    topic: '/conference/consumer/created',
    payload: auth
  }),
  //消费者更新
  [InfoType.CONSUMERUPDATE]: (client, auth) => ({
    topic: '/conference/consumer/updated',
    payload: auth
  }),
  
  // 默认处理器
  default: (client, auth) => ({
    topic: '/system/unknown',
    payload: { type: 'UNKNOWN_TYPE' }
  })
};


// TODO remove - never used?
function room() {
  return Object.values(roomList).map((r) => {
    return {
      router: r.router.id,
      peers: Object.values(r.peers).map((p) => {
        return {
          name: p.name
        }
      }),
      id: r.id
    }
  })
}

/**
 * Get next mediasoup Worker.
 */
function getMediasoupWorker() {
  // const worker = workers[nextMediasoupWorkerIdx]

  // if (++nextMediasoupWorkerIdx === workers.length) nextMediasoupWorkerIdx = 0

  // return worker
  if (workers.length === 0) {
    throw new Error('No mediasoup workers available');
  }
  const worker = workers[nextMediasoupWorkerIdx];
  console.log(`Assigning worker [pid:${worker.pid}]`);
  
  if (++nextMediasoupWorkerIdx === workers.length) {
    nextMediasoupWorkerIdx = 0;
  }
  return worker;
}
