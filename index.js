const { createLobby } = require('./lobby')
const lobby = createLobby()
const { createUtil } = require('./util')
const util = createUtil()
const { createGameEngine } = require('./gameEngine')
const gameEngine = createGameEngine()

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
            // if (room == 'lobby') {
            //     console.log("leaving lobby")
            //     lobby.leaveLobby(socket.id)
            //     io.to('lobby').emit('lobbyChanged', lobby.getGames())
            // }
            if (room.startsWith('lobby_')) {
                let game = socket.adapter.rooms.get(room).game
                if (game) {
                    let player = game.players.find(player => player.playerSocketId == socket.id)
                    if (player) {
                        player.leaved = true
                        game.numberCurrentPlayers--
                        if (game.currentPlayer == player.id) {
                            if (game.firstCard) {
                                let firstCard = game.board.find((searchCard) => searchCard.id == game.firstCard.id)
                                firstCard.isRevealed = false
                                game.board[firstCard.id] = firstCard
                            }
                            let nextPlayerID = gameEngine.nextPlayer(game.currentPlayer, game)
                            if (game.numberCurrentPlayers == 1) {
                                game.status = 2
                                player = game.players.find((searchPlayer) => searchPlayer.id == nextPlayerID)
                                game.playerWin = player.player.id
                                io.to(room).emit('gameEnded', game)
                                return
                            }
                            game.currentPlayer = nextPlayerID
                        }
                        io.to(room).emit('gameChanged', game)
                    }
                } else {
                    console.log("game not found")
                    let gameID = Number(room.split('_')[1])
                    console.log(gameID)
                    const gameLobby = lobby.getGame(gameID)
                    console.log(lobby.existsGame(gameID))
                    if (gameLobby) {
                        gameLobby.players = gameLobby.players.filter(player => player.playerSocketId != socket.id)
                        gameLobby.numberCurrentPlayers--
                        let index = 1
                        console.log("test")
                        gameLobby.players.forEach((player) => {
                            player.id = index
                            index++
                        })
                        console.log(gameLobby.players)
                        if (gameLobby.numberCurrentPlayers == 0) {
                            lobby.removeGame(gameID)
                            io.to('lobby').emit('lobbyChanged', lobby.getGames())
                        }
                        io.to('lobby_' + gameLobby.id).emit('gameLobbyChanged', gameLobby)
                    }

                }
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
        if(!socket.rooms.has('lobby')){
            socket.join('lobby')
        }
        const games = lobby.getGames()
        if (callback) {
            callback(games)
        }
    })

    socket.on('addGame', (information, callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const game = lobby.addGame(socket.data.user, socket.id, information)
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
        if (socket.data.user.id == game.players[0].player.id) {
            if (callback) {
                callback({
                    errorCode: 3,
                    errorMessage: 'User cannot join a game that he created!'
                })
            }
            return
        }

        if (game.numberCurrentPlayers == game.numberPlayers) {
            if (callback) {
                callback({
                    errorCode: 3,
                    errorMessage: 'Game is full!'
                })
            }
            return
        }

        let player = { id: game.numberCurrentPlayers + 1, player: socket.data.user, playerSocketId: socket.id, numPars: 0, leaved: false, ready: false }
        game.players.push(player)
        game.numberCurrentPlayers++
        console.log(game)
        socket.join('lobby_' + game.id)
        io.to('lobby_' + game.id).emit('gameLobbyChanged', game)
        socket.leave('lobby')
        //lobby.removeGame(id)
        //io.to('lobby').emit('lobbyChanged', lobby.getGames())
        if (callback) {
            callback(game)
        }
    })

    socket.on('leaveGame', (id, callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const game = lobby.getGame(id)
        if (game) {
            game.players = game.players.filter(player => player.playerSocketId != socket.id)
            game.numberCurrentPlayers--
            let index = 1
            game.players.forEach((player) => {
                player.id = index
                if(index == 1){
                    player.ready = null
                }
                index++

            })
            console.log(game.players)
            if (game.numberCurrentPlayers == 0) {
                lobby.removeGame(id)
                io.to('lobby').emit('lobbyChanged', lobby.getGames())
            }
            io.to('lobby_' + game.id).emit('gameLobbyChanged', game)
            if (callback) {
                callback(game)
            }
        }
    })

    socket.on('startGame', (id, gameDB, callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const game = lobby.getGame(id)
        if (socket.data.user.id != game.players[0].player.id) {
            if (callback) {
                callback({
                    errorCode: 3,
                    errorMessage: 'User cannot start a game that he has not created!'
                })
            }
            return
        }

        if (game.numberCurrentPlayers < 2) {
            if (callback) {
                callback({
                    errorCode: 4,
                    errorMessage: 'Not enough players to start the game!'
                })
            }
            return
        }
        let players = game.players.filter(player => player.id != 1)
        if (players.some(player => !player.ready)) {
            if (callback) {
                callback({
                    errorCode: 4,
                    errorMessage: 'Not all players are ready!'
                })
            }
            return
        }

        game.gameDBID = gameDB.gameDBID
        gameEngine.initGame(game)
        socket.adapter.rooms.get('lobby_' + id).game = game
        lobby.removeGame(id)
        io.to('lobby').emit('lobbyChanged', lobby.getGames())
        io.to('lobby_' + id).emit('gameStarted', game)
    })

    socket.on('move', (cardID, id, callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const roomName = 'lobby_' + id
        const game = socket.adapter.rooms.get(roomName).game;

        let result = gameEngine.play(cardID, game, socket.id)

        card = game.board.find((searchCard) => searchCard.id == cardID)
        console.log(game.firstCard)
        console.log(result)
        if (result == 2) {
            firstCard = game.board.find((searchCard) => searchCard.id == game.firstCard.id)
            if (firstCard.value == card.value) {
                setTimeout(() => {
                    firstCard.isMatched = true
                    card.isMatched = true
                    game.firstCard = null
                    game.board[firstCard.id] = firstCard;
                    game.board[cardID] = card;

                    player = game.players.find((searchPlayer) => searchPlayer.id == game.currentPlayer)
                    player.numPars++
                    game.numParsLeft--

                    if (player.numPars == game.numPars / 2 && game.status != 1) {
                        console.log("player win")
                        game.playerWin = player.player.id
                        game.status = 1
                        console.log(game.playerWin)
                    }

                    io.to(roomName).emit('gameChanged', game)

                    if (game.numParsLeft == 0) {
                        game.status = 2
                        io.to(roomName).emit('gameEnded', game)
                    }

                    return;
                }, 1000)
            } else {
                setTimeout(() => {
                    firstCard.isRevealed = false
                    card.isRevealed = false
                    game.firstCard = null

                    game.board[firstCard.id] = firstCard;
                    game.board[cardID] = card;
                    console.log("cards not matched")
                    let nextPlayerID = gameEngine.nextPlayer(game.currentPlayer, game)
                    if (nextPlayerID == -1) {
                        game.status = 2
                        player = game.players.find((searchPlayer) => searchPlayer.id == game.currentPlayer)
                        game.playerWin = player.player.id

                        io.to(roomName).emit('gameEnded', game)
                        return
                    }
                    game.currentPlayer = nextPlayerID
                    io.to(roomName).emit('gameChanged', game)


                    return;
                }, 1000)
            }
        } else {
            console.log("first card")
        }
        if (result) {
            io.to(roomName).emit('gameChanged', game)
        }
        if (callback) {
            callback(game)
        }

    })


    socket.on('removeGame', (id, callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const game = lobby.getGame(id)
        if (socket.data.user.id != game.players[0].player.id) {
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

    socket.on('quitGame', (id, callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const roomName = 'lobby_' + id
        const game = socket.adapter.rooms.get(roomName).game;
        console.log("test1")
        let player = game.players.find(player => player.playerSocketId == socket.id)
        player.leaved = true
        game.numberCurrentPlayers--
        if (game.currentPlayer == player.id) {
            if (game.firstCard) {
                let firstCard = game.board.find((searchCard) => searchCard.id == game.firstCard.id)
                firstCard.isRevealed = false
                game.board[firstCard.id] = firstCard
                console.log("test2")
            }
            let nextPlayerID = gameEngine.nextPlayer(game.currentPlayer, game)
            if (game.numberCurrentPlayers == 1) {
                game.status = 2
                player = game.players.find((searchPlayer) => searchPlayer.id == nextPlayerID)
                game.playerWin = player.player.id
                console.log("test3")
                io.to(roomName).emit('gameEnded', game)
                return
            }
            game.currentPlayer = nextPlayerID


        }
        console.log("test4")
        player.leaved = true
        game.numberCurrentPlayers--
        io.to(roomName).emit('gameChanged', game)

        if (callback) {
            callback()
        }
    })

    socket.on('readyGame', (id, callback) => {
        if (!util.checkAuthenticatedUser(socket, callback)) {
            return
        }
        const game = lobby.getGame(id)
        let player = game.players.find(player => player.playerSocketId == socket.id)
        player.ready = !player.ready
        console.log(player.ready)
        io.to('lobby_' + game.id).emit('gameLobbyChanged', game)
        console.log(player.ready)
        console.log(callback)
        if (callback) {
            callback(game)
        }
    })

})
