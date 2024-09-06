const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const players = new Map();
let circles = [];
let walls = []; // Add this line to store walls
let gameStarted = false;
let hostId = null;
let scores = new Map();

const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

function createCircles(n) {
    circles = [];
    for (let i = 0; i < n; i++) {
        circles.push({
            id: i,
            x: Math.random() * GAME_WIDTH,
            y: Math.random() * GAME_HEIGHT,
            radius: 20 + Math.random() * 20,
            color: `rgb(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255})`
        });
    }
}

function createWalls(n) {
    walls = [];
    for (let i = 0; i < n; i++) {
        walls.push({
            x: Math.random() * GAME_WIDTH,
            y: Math.random() * GAME_HEIGHT,
            width: 20 + Math.random() * 60,
            height: 20 + Math.random() * 60,
            color: `rgb(100, 100, 100)`
        });
    }
}

wss.on('connection', (ws) => {
    const id = Date.now();
    const color = `#${Math.floor(Math.random()*16777215).toString(16)}`;
    const playerNumber = players.size + 1;
    const player = { 
        id, 
        x: GAME_WIDTH / 2, 
        y: GAME_HEIGHT / 2, 
        angle: 0, 
        color, 
        playerNumber 
    };

    players.set(ws, player);
    scores.set(id, 0);

    if (!hostId) {
        hostId = id;
    }

    ws.send(JSON.stringify({ 
        type: 'init', 
        player, 
        circles, 
        walls, // Add this line to send walls data
        gameStarted, 
        isHost: id === hostId, 
        scores: Object.fromEntries(scores),
        playerNumber
    }));

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        if (data.type === 'update') {
            // Check collision with walls before updating position
            const newX = data.x;
            const newY = data.y;
            let collision = false;
            walls.forEach(wall => {
                if (newX > wall.x && newX < wall.x + wall.width &&
                    newY > wall.y && newY < wall.y + wall.height) {
                    collision = true;
                }
            });
            if (!collision) {
                player.x = newX;
                player.y = newY;
                player.angle = data.angle;
            }
        } else if (data.type === 'shoot') {
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'shoot', id: player.id, x: data.x, y: data.y, angle: data.angle }));
                }
            });
        } else if (data.type === 'startGame' && id === hostId) {
            let countdown = 3;
            const countdownInterval = setInterval(() => {
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'countdown', count: countdown }));
                    }
                });
                countdown--;
                if (countdown < 0) {
                    clearInterval(countdownInterval);
                    gameStarted = true;
                    createCircles(10);
                    createWalls(5);
                    scores.forEach((_, playerId) => scores.set(playerId, 0));
                    wss.clients.forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'gameStart', circles, walls, scores: Object.fromEntries(scores) }));
                        }
                    });
                }
            }, 1000);
        } else if (data.type === 'hitCircle') {
            circles = circles.filter(circle => circle.id !== data.circleId);
            const scoringPlayerId = data.playerId;
            if (scores.has(scoringPlayerId)) {
                scores.set(scoringPlayerId, scores.get(scoringPlayerId) + 10);
            }
            if (circles.length === 0) {
                gameStarted = false;
                const winner = Array.from(scores.entries()).reduce((a, b) => a[1] > b[1] ? a : b);
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ 
                            type: 'gameOver', 
                            scores: Object.fromEntries(scores),
                            winner: { id: winner[0], score: winner[1] }
                        }));
                    }
                });
            } else {
                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'updateCircles', circles, scores: Object.fromEntries(scores) }));
                    }
                });
            }
        } else if (data.type === 'resetGame' && id === hostId) {
            gameStarted = false;
            createCircles(10);
            createWalls(5); // Create new walls for the new game
            scores.forEach((_, playerId) => scores.set(playerId, 0));
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'resetGame', circles, walls }));
                }
            });
        }
    });

    ws.on('close', () => {
        players.delete(ws);
        scores.delete(id);
        if (id === hostId) {
            const newHost = players.values().next().value;
            if (newHost) {
                hostId = newHost.id;
                const hostWs = [...players.entries()].find(([_, p]) => p.id === hostId)[0];
                hostWs.send(JSON.stringify({ type: 'becomeHost' }));
            } else {
                hostId = null;
                gameStarted = false;
            }
        }
    });

    setInterval(() => {
        const gameState = { players: Array.from(players.values()), circles, walls, scores: Object.fromEntries(scores) };
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'gameState', gameState }));
            }
        });
    }, 1000 / 60); // 60 fps
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});