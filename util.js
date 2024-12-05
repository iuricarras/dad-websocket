exports.createUtil = () => {
    // Global util functions to use in the socket.io
    const checkAuthenticatedUser = (socket, callback) => {
        if (!socket.data.user) {
            if (callback) {
                callback({
                    errorCode: 2,
                    errorMessage: 'User is not authenticated!'
                })
            }
            return false
        }
        return true
    }
    return {
        checkAuthenticatedUser
    }
}