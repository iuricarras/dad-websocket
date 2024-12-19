exports.createLobby = () => {
    const games = new Map()
    let id = 1

    const addGame = (user, socketId, information) => {
        id++
        console.log(information)
        let player = {id: 1, player: user, playerSocketId: socketId, numPars: 0, leaved: false}
        const game = {
            id: id,
            created_at: Date.now(),
            numberCurrentPlayers: 1,
            players: [player],
            numberPlayers: information.numberPlayers,
            boardId: information.boardId,
        }
        games.set(id, game)
        return game
    }

    const removeGame = (id) => {
        games.delete(id)
        return games
    }

    const existsGame = (id) => {
        return games.has(id)
    }

    const getGame = (id) => {
        return games.get(id)
    }

    const getGames = () => {
        return [...games.values()]
    }

    const leaveLobby = (socketId) => {
        const gamesToDelete = [...games.values()].filter(game => game.players[0].playerSocketId == socketId)
        gamesToDelete.forEach(game => {
            games.delete(game.id)
        })
        return getGames()
    }

    return {
        getGames,
        getGame,
        addGame,
        removeGame,
        existsGame,
        leaveLobby
    }
}