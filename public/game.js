const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 800;
canvas.height = 600;

const ship = { x: canvas.width / 2, y: canvas.height / 2, angle: 0, speed: 5 };
const lasers = [];
let circles = [];
let players = new Map();
let myId;

const keys = {};

const ws = new WebSocket('ws://localhost:3000');

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    if (data.type === 'init') {
        myId = data.player.id;
        ship.color = data.player.color;
        circles = data.circles;
    } else if (data.type === 'gameState') {
        players = new Map(data.gameState.players.map(p => [p.id, p]));
        circles = data.gameState.circles;
    } else if (data.type === 'shoot') {
        lasers.push({ x: data.x, y: data.y, angle: data.angle });
    }
};

function drawShip(x, y, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-10, 10);
    ctx.lineTo(-10, -10);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
}

function drawLasers() {
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    lasers.forEach(laser => {
        ctx.beginPath();
        ctx.moveTo(laser.x, laser.y);
        ctx.lineTo(laser.x + Math.cos(laser.angle) * 20, laser.y + Math.sin(laser.angle) * 20);
        ctx.stroke();
    });
}

function drawCircles() {
    circles.forEach(circle => {
        ctx.beginPath();
        ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
        ctx.fillStyle = circle.color;
        ctx.fill();
    });
}

function update() {
    if (keys.ArrowUp) {
        ship.x += Math.cos(ship.angle) * ship.speed;
        ship.y += Math.sin(ship.angle) * ship.speed;
    }
    if (keys.ArrowLeft) ship.angle -= 0.1;
    if (keys.ArrowRight) ship.angle += 0.1;

    ship.x = (ship.x + canvas.width) % canvas.width;
    ship.y = (ship.y + canvas.height) % canvas.height;

    ws.send(JSON.stringify({ type: 'update', x: ship.x, y: ship.y, angle: ship.angle }));

    lasers.forEach(laser => {
        laser.x += Math.cos(laser.angle) * 10;
        laser.y += Math.sin(laser.angle) * 10;
    });

    lasers.forEach((laser, index) => {
        if (laser.x < 0 || laser.x > canvas.width || laser.y < 0 || laser.y > canvas.height) {
            lasers.splice(index, 1);
        }
    });
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    update();
    drawShip(ship.x, ship.y, ship.angle, ship.color);
    players.forEach((player) => {
        if (player.id !== myId) {
            drawShip(player.x, player.y, player.angle, player.color);
        }
    });
    drawLasers();
    drawCircles();
    requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') {
        ws.send(JSON.stringify({ type: 'shoot', x: ship.x, y: ship.y, angle: ship.angle }));
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

gameLoop();