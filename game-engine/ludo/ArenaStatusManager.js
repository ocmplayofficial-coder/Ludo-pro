/**
 * ArenaStatusManager
 * Maintains the live status (idle, waiting, playing) of each Ludo arena (queueKey).
 * Tracks waitingCount (players in matchmaking queue) and playingCount (players currently in active matches).
 */
export class ArenaStatusManager {
    static state = {}; // key: queueKey -> { waitingCount: number, playingCount: number }

    static initQueue(queueKey) {
        if (!this.state[queueKey]) {
            this.state[queueKey] = { waitingCount: 0, playingCount: 0 };
        }
    }

    /**
     * Recomputes and broadcasts the state for a specific queueKey based strictly on the queue.
     * @param {string} queueKey - e.g. "10:CLASSIC"
     * @param {Array} currentQueue - The current array of players waiting in this queue
     */
    static syncState(queueKey, currentQueue) {
        this.initQueue(queueKey);
        const waitingCount = currentQueue ? currentQueue.length : 0;
        // playingCount remains unchanged here; only waitingCount is updated from the queue
        this.state[queueKey].waitingCount = waitingCount;
        this.broadcast(queueKey);
    }

    static joinPool(queueKey) {
        this.initQueue(queueKey);
        this.state[queueKey].playingCount += 1;
        this.broadcast(queueKey);
    }

    static leavePool(queueKey) {
        this.initQueue(queueKey);
        if (this.state[queueKey].playingCount > 0) {
            this.state[queueKey].playingCount -= 1;
        }
        this.broadcast(queueKey);
    }

    static broadcast(queueKey) {
        if (!global.ludoNamespace) return;
        const { waitingCount, playingCount } = this.state[queueKey];
        let status = 'empty';
        const players = waitingCount + playingCount;
        if (players === 0) {
            status = 'empty';
        } else if (waitingCount === 1 && playingCount === 0) {
            status = 'waiting';
        } else if (waitingCount >= 2 && playingCount === 0) {
            status = 'starting';
        } else if (playingCount >= 1) {
            status = 'playing';
        }
        console.log('BROADCAST_QUEUE_UPDATED', { queueKey, players, waitingCount, playingCount, status });
        global.ludoNamespace.emit('queueUpdated', {
            queueKey,
            players,
            waitingCount,
            playingCount,
            status
        });
    }

    static broadcastAll(socket) {
        // Broadcast for any queues that have people waiting or playing
        for (const [queueKey, state] of Object.entries(this.state)) {
            const { waitingCount, playingCount } = state;
            const players = waitingCount + playingCount;
            let status = 'empty';
            if (players === 0) {
                status = 'empty';
            } else if (waitingCount === 1 && playingCount === 0) {
                status = 'waiting';
            } else if (waitingCount >= 2 && playingCount === 0) {
                status = 'starting';
            } else if (playingCount >= 1) {
                status = 'playing';
            }
            socket.emit('queueUpdated', { queueKey, players, waitingCount, playingCount, status });
        }
    }
}
