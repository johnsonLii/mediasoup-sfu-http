const config = require('./config')
module.exports = class Room {
  constructor(room_id, worker, io) {
    this.id = room_id
    this.worker = worker
    this.io = io
    this.peers = new Map()
    this.routerPromise = this.createRouter() // 保存Promise引用
  }

  async createRouter() {
    const mediaCodecs = config.mediasoup.router.mediaCodecs
    this.router = await this.worker.createRouter({ mediaCodecs })
    console.log("thisrouter=>" + JSON.stringify(this.router));
    
    return this.router
  }

  async getRtpCapabilities() {
    if (!this.router) {
      console.log("error no router");
      await this.routerPromise // 等待Router创建完成
    }
    return this.router.rtpCapabilities
  }



  // constructor(room_id, worker, io) {
  //   this.id = room_id
  //   const mediaCodecs = config.mediasoup.router.mediaCodecs
  //   worker
  //     .createRouter({
  //       mediaCodecs
  //     })
  //     .then(
  //       function (router) {
  //         this.router = router
  //       }.bind(this)
  //     )

  //   this.peers = new Map()
  //   this.io = io
  // }

  addPeer(peer) {
    this.peers.set(peer.id, peer)
  }

  // getProducerListForPeer() {
  //   let producerList = []
  //   this.peers.forEach((peer) => {
  //     peer.producers.forEach((producer) => {
  //       console.log("producer==>" , producer) ;
  //       producerList.push({
  //         producer_id: producer.id
  //       })
  //     })
  //   })
  //   return producerList
  // }


  // getProducerForPeer(produceId) {
  //   console.log("00000000000----"+produceId);
  //   this.peers.forEach((peer) => {
  //     peer.producers.forEach((producer) => {
  //       console.log("2222222222222-",producer);
  //       if(produceId == producer.id){
  //         console.log("111111111111S-",producer);
  //         return  producer;
  //       } 
  //     })
  //   })
  //   return null;
  // }

  getProducerForPeer(produceId) {
    if (!(this.peers instanceof Map)) {
        console.error("this.peers is not a Map:", this.peers);
        return null;
    }
    for (const peer of this.peers.values()) {
        if (!(peer.producers instanceof Map)) {
            console.warn("peer.producers is not a Map:", peer.producers);
            continue;
        }
        const producer = peer.producers.get(produceId); // 直接查找
        if (producer) {
          let producerList = []
          producerList.push({
            id: producer.id,        // 媒体ID
            code: '',
            rtpParameters: producer.rtpParameters,         // 根据业务需求填充（示例留空）
            operator: '',           // 根据业务需求填充（示例留空）
            media: {
              id: producer.id,      // 媒体内部ID
              paused: producer.paused,
              kind: producer.kind,  // 'audio' 或 'video'
              type: producer.type,  // 'simple'/'simulcast'/'svc'
              closed: producer.closed,
              layer: 0,             // 根据业务需求设置层级
              producerPaused: producer.paused,
              producerClosed: producer.closed,
              config: {}            // 自定义配置对象
            },
            user: {
              id: peer.id,          // 用户ID（使用socket_id）
              name: peer.name       // 用户名
              // 可扩展其他用户字段
            }
          })
          return producerList[0];
        }
    }
    return null;
}

  getProducerListForPeer() {
    let producerList = []
    this.peers.forEach((peer) => {
      peer.producers.forEach((producer) => {
        // 构建符合客户端 Media 接口的数据结构
        producerList.push({
          id: producer.id,        // 媒体ID
          code: '',
          rtpParameters: producer.rtpParameters,         // 根据业务需求填充（示例留空）
          operator: '',           // 根据业务需求填充（示例留空）
          media: {
            id: producer.id,      // 媒体内部ID
            paused: producer.paused,
            kind: producer.kind,  // 'audio' 或 'video'
            type: producer.type,  // 'simple'/'simulcast'/'svc'
            closed: producer.closed,
            layer: 0,             // 根据业务需求设置层级
            producerPaused: producer.paused,
            producerClosed: producer.closed,
            config: {}            // 自定义配置对象
          },
          user: {
            id: peer.id,          // 用户ID（使用socket_id）
            name: peer.name       // 用户名
            // 可扩展其他用户字段
          },
          appData: producer.appData
        })
      })
    })
    return producerList
  }

  // getRtpCapabilities() {
  //   return this.router.rtpCapabilities
  // }

  async createWebRtcTransport(socket_id) {
    // 确保router已创建
    if (!this.router) {
      await this.routerPromise;
    }
    const { maxIncomingBitrate, initialAvailableOutgoingBitrate } = config.mediasoup.webRtcTransport

    const transport = await this.router.createWebRtcTransport({
      listenIps: config.mediasoup.webRtcTransport.listenIps,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate
    })
    // console.log(' Router:', this.router); 
    // console.log('Transport 所属 Router:', transport.router); 
    if (maxIncomingBitrate) {
      try {
        await transport.setMaxIncomingBitrate(maxIncomingBitrate)
      } catch (error) {}
    }

    //TEST 
    // transport.on('icestatechange', (iceState) => {
    //   console.log(`TEST==[Server] ICE state changed to: ${iceState}`);
    // });
    // transport.on('icecandidate', (candidate) => {
    //   console.log(`TEST==[Server] ICE candidate: ${candidate.foundation}`);
    // });

    // const iceCandidates = await webRtcTransport.getIceCandidates();
    // console.log(`TEST==[Server] ICE iceCandidates` , iceCandidates);

    transport.on(
      'dtlsstatechange',
      function (dtlsState) {
        if (dtlsState === 'closed') {
          console.log('Transport close', { name: this.peers.get(socket_id).name })
          // console.log(`TEST==[Server] DTLS state changed to: ${dtlsState}`);
          transport.close()
        // }else if(dtlsState === 'connected'){

        }
      }.bind(this)
    )

    transport.on('close', () => {
      console.log('Transport close', { name: this.peers.get(socket_id).name })
    })

    console.log('Adding transport', { transportId: transport.id })
    this.peers.get(socket_id).addTransport(transport)
    return {
      params: {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      }
    }
  }

  

  async connectPeerTransport(socket_id, transport_id, dtlsParameters) {
    if (!this.peers.has(socket_id)) return

    await this.peers.get(socket_id).connectTransport(transport_id, dtlsParameters)
  }

  async produce(socket_id, producerTransportId, rtpParameters, kind,appData) {
    // handle undefined errors
    return new Promise(
      async function (resolve, reject) {
        // console.log("problem^^^^");
        // console.log("producerTransportId",producerTransportId);
        // console.log("rtpParameters",rtpParameters);
        // console.log("kind",kind);
        console.log("2放入生产者！");
        let producer = await this.peers.get(socket_id).createProducer(producerTransportId, rtpParameters, kind,appData)
        resolve(producer)
        // this.broadCast(socket_id, 'newProducers', [
        //   {
        //     producer_id: producer.id,
        //     producer_socket_id: socket_id
        //   }
        // ])
      }.bind(this)
    )
  }

  async consume(socket_id, consumer_transport_id, producer_id, rtpCapabilities) {
    // handle nulls
    // console.log('能否消费此 Producer:', 
    //   this.router.canConsume({ producer_id, rtpCapabilities })
    // );
    // if (
    //   !this.router.canConsume({
    //     producerId: producer_id,
    //     rtpCapabilities
    //   })
    // ) {
    //   console.error('can not consume')
    //   return
    // }

    let appData = null;
    let getProducer = null;
    let found = false;

    for (const peer of this.peers.values()) {
        if (found) break; // 如果已经找到，跳出外层循环
        
        for (const producer of peer.producers.values()) {
            if (producer.id === producer_id) {
                getProducer = producer;
                found = true; // 设置标志
                break; // 跳出内层循环
            }
        }
    }
    
    // let  getProducer = await this.peers.get(socket_id).getProducer(producer_id);
    if (!getProducer) {
      console.error('Producer not found for consumer creation' + producer_id);
    }else{
      appData = getProducer.appData;
    }

    let { consumer, params } = await this.peers
      .get(socket_id)
      .createConsumer(consumer_transport_id, producer_id, rtpCapabilities,appData)

    consumer.on(
      'producerclose',
      function () {
        console.log('Consumer closed due to producerclose event', {
          name: `${this.peers.get(socket_id).name}`,
          consumer_id: `${consumer.id}`
        })
        this.peers.get(socket_id).removeConsumer(consumer.id)
        // tell client consumer is dead
        this.io.to(socket_id).emit('consumerClosed', {
          consumer_id: consumer.id
        })
      }.bind(this)
    )

    return params
  }

  async removePeer(socket_id) {
    this.peers.get(socket_id).close()
    this.peers.delete(socket_id)
  }

  closeProducer(socket_id, producer_id) {
    this.peers.get(socket_id).closeProducer(producer_id)
  }

  broadCast(socket_id, name, data) {
    for (let otherID of Array.from(this.peers.keys()).filter((id) => id !== socket_id)) {
      this.send(otherID, name, data)
    }
  }

  send(socket_id, name, data) {
    this.io.to(socket_id).emit(name, data)
  }

  getPeers() {
    return this.peers
  }

  toJson() {
    return {
      id: this.id,
      peers: JSON.stringify([...this.peers])
    }
  }
}
