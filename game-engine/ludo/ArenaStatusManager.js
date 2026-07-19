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
     * 
     * @param {string} queueKey - e.g. "10:CLASSIC"
     * @param {Array} currentQueue - The current array of players waiting in this queue
     */
    static syncState(queueKey, currentQueue) {
        this.initQueue(queueKey);
        
        const waitingCount = currentQueue ? currentQueue.length : 0;
        
        this.state[queueKey] = { waitingCount };
        this.broadcast(queueKey);
    }

    static broadcast(queueKey) {
        if (!global.ludoNamespace) return;

        const { waitingCount } = this.state[queueKey];
        
        let status = 'empty';
        let players = waitingCount;

        if (waitingCount === 1) {
            status = 'waiting';
        } else if (waitingCount >= 2) {
            status = 'starting';
        }

        console.log('BROADCAST_QUEUE_UPDATED', { queueKey, players, status });

        global.ludoNamespace.emit('queueUpdated', {
            queueKey,
            players,
            status
        });
    }

    static broadcastAll(socket) {
        // Broadcast for any queues that have people waiting
        for (const [queueKey, state] of Object.entries(this.state)) {
            let status = 'empty';
            let players = state.waitingCount;

            if (players === 1) {
                status = 'waiting';
            } else if (players >= 2) {
                status = 'starting';
            }
            
            socket.emit('queueUpdated', { queueKey, players, status });
        }
    }
}
