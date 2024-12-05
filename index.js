const { createLobby } = require('./lobby')
const lobby = createLobby()
const { createUtil } = require('./util')
const util = createUtil()

const httpServer = require('http').createServer()
const io = require("socket.io")(httpServer, {
    cors: {
        origin: '*',
        methods: ["GET", "POST"],
        credentials: true
    }
})

httpServer.listen(8081, () => {
    console.log('listening on *:8081')
})

io.on('connection', (socket) => {
    console.log(`Client with socket id ${socket.id} has connected!`)

    // ------------------------------------------------------
    // Disconnect
    // ------------------------------------------------------
    // disconnection event is triggered when the client disconnects but is still on the rooms

    socket.on("disconnecting", (reason) => {
        socket.rooms.forEach(room => {
            if (room == 'lobby') {
                lobby.leaveLobby(socket.id)
                io.to('lobby').emit('lobbyChanged', lobby.getGames())
            }
        })
    })

    // ------------------------------------------------------
    // User identity
    // ------------------------------------------------------

    socket.on('login', (user) => {
        // Stores user information on the socket as "user" property
        socket.data.user = user
        if (user && user.id) {
            socket.join('user_' + user.id)
            socket.join('lobby')
        }
    })

    socket.on('logout', (user) => {
        if (user && user.id) {
            socket.leave('user_' + user.id)
            lobby.leaveLobby(socket.id)
            io.to('lobby').emit('lobbyChanged', lobby.getGames())
            socket.leave('lobby')
        }
        socket.data.user = undefined
    })

    // ------------------------------------------------------
    // Chat and Private Messages
    // ------------------------------------------------------

    socket.on('chatMessage', (message) => {
        const payload = {
            user: socket.data.user,
            message: message,
        }
        io.sockets.emit('chatMessage', payload)
    })

    socket.on('lobbyChat', (lobbyId, message, callback) => {
        const destinationRoomName = 'lobby_' + lobbyId
        if (io.sockets.adapter.rooms.get(destinationRoomName)) {
            const payload = {
                user: socket.data.user,
                message: message,
            }
            io.to(destinationRoomName).emit('lobbyChat', payload)
            if (callback) {
                callback({ success: true })
            }
        } else {
            if (callback) {
                callback({
                    errorCode: 1,
                    errorMessage: `Lobby "${lobbyId}" doesn't exist!`
                })
            }
        }
    })


    socket.on('privateMessage', (clientMessageObj, callback) => {
        const destinationRoomName = 'user_' + clientMessageObj?.destinationUser?.id

        // Check if the destination user is online
        if (io.sockets.adapter.rooms.get(destinationRoomName)) {
            const payload = {
                user: socket.data.user,
                message: clientMessageObj.message,
            }
            // send the "privateMessage" to the destination user (using "his" room)
            io.to(destinationRoomName).emit('privateMessage', payload)
            if (callback) {
                callback({ success: true })
            }
        } else {
            if (callback) {
                callback({
                    errorCode: 1,
                    errorMessage: `User "${clientMessageObj?.destinationUser?.name}" is not online!`
                })
            }
        }
    })

    // ------------------------------------------------------
    // Lobby
    // ------------------------------------------------------

    socket.on('fetchGames', (callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const games = lobby.getGames()
        if (callback) {
            callback(games)
        }
    })

    socket.on('addGame', (callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const game = lobby.addGame(socket.data.user, socket.id)
        socket.join('lobby_' + game.id)
        io.to('lobby').emit('lobbyChanged', lobby.getGames())
        if (callback) {
            callback(game)
        }
    })

    socket.on('joinGame', (id, callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const game = lobby.getGame(id)
        if (socket.data.user.id == game.player1.id) {
            if (callback) {
                callback({
                    errorCode: 3,
                    errorMessage: 'User cannot join a game that he created!'
                })
            }
            return
        }
        game.player2 = socket.data.user
        game.player2SocketId = socket.id
        socket.join('lobby_' + game.id)
        //lobby.removeGame(id)
        //io.to('lobby').emit('lobbyChanged', lobby.getGames())
        if (callback) {
            callback(game)
        }
    })

    socket.on('removeGame', (id, callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const game = lobby.getGame(id)
        if (socket.data.user.id != game.player1.id) {
            if (callback) {
                callback({
                    errorCode: 4,
                    errorMessage: 'User cannot remove a game that he has not created!'
                })
            }
            return
        }
        lobby.removeGame(game.id)
        io.to('lobby').emit('lobbyChanged', lobby.getGames())
        if (callback) {
            callback(game)
        }
    })
})



