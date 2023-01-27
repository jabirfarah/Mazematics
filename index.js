import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { parse } from 'node:url';
import { WebSocketServer } from 'ws';
import mime from 'mime/lite.js';

const TILES = [
	{ // Floor
		solid: false
	},
	{ // Walls
		solid: true,
		movable: false
	},
	{ // Movable boxes
		solid: true,
		movable: true
	}
];

const world = [ // testing world
	[1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
	[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 2, 2, 2, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 2, 2, 2, 0, 0],
	[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
	[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
	[1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1]
];

const WORLD_SIZE_X = world.length;
const WORLD_SIZE_Y = world[0].length;
const SPAWN_X = 1;
const SPAWN_Y = 1;

const players = new Map();
const updateAllPlayers = () => {
	for (const { socket } of [...players.values()])
		socket.send(JSON.stringify({
			world,
			players: [...players.values()].map(({ color, direction, position, pulling }) => ({ color, direction, position, pulling }))
		}));
};
new WebSocketServer({
	server: createServer((request, response) => {
		const path = join('./public/', parse(request.url).pathname);
		createReadStream(path).on('open', function() {
			response.setHeader('Content-Type', mime.getType(path));
			this.pipe(response);
		}).on('error', () => response.writeHead(404).end());
	}).listen(8080)
}).on('connection', (socket) => {
	const uuid = randomUUID();
	players.set(uuid, {
		color: `#${Math.floor(Math.random() * 16777215).toString(16)}`,
		direction: {
			x: 0,
			y: 0
		},
		position: {
			x: SPAWN_X,
			y: SPAWN_Y
		},
		pulling: {
			x: 0,
			y: 0
		},
		socket
	});
	updateAllPlayers();
	const player = players.get(uuid);
	socket.on('message', (data) => {
		try {
			const message = JSON.parse(data);
			switch (message.action) {
				case 'push':
					if (Object.hasOwn(player.direction, message.directionAxis)) {
						const newDirection = {
							x: 0,
							y: 0
						};
						message.directionStep = +(message.directionStep > 0) || -1;
						newDirection[message.directionAxis] = message.directionStep;
						if (player.direction[message.directionAxis] === message.directionStep) {
							const endPushingPosition = { ...player.position };
							do {
								endPushingPosition.x = (endPushingPosition.x + newDirection.x + WORLD_SIZE_X) % WORLD_SIZE_X;
								endPushingPosition.y = (endPushingPosition.y + newDirection.y + WORLD_SIZE_Y) % WORLD_SIZE_Y;
							} while (TILES[world[endPushingPosition.x][endPushingPosition.y]].movable);
							if (!TILES[world[endPushingPosition.x][endPushingPosition.y]].solid) {
								for (let x = endPushingPosition.x; x - player.position.x; x = (x - newDirection.x + WORLD_SIZE_X) % WORLD_SIZE_X)
									world[x][player.position.y] = world[(x - newDirection.x + WORLD_SIZE_X) % WORLD_SIZE_X][player.position.y];
								for (let y = endPushingPosition.y; y - player.position.y; y = (y - newDirection.y + WORLD_SIZE_Y) % WORLD_SIZE_Y)
									world[player.position.x][y] = world[player.position.x][(y - newDirection.y + WORLD_SIZE_Y) % WORLD_SIZE_Y];
								const pulledTile = world[(player.position.x + player.pulling.x + WORLD_SIZE_X) % WORLD_SIZE_X][(player.position.y + player.pulling.y + WORLD_SIZE_Y) % WORLD_SIZE_Y];
								if (TILES[pulledTile].movable) {
									world[player.position.x][player.position.y] = pulledTile;
									world[(player.position.x + player.pulling.x + WORLD_SIZE_X) % WORLD_SIZE_X][(player.position.y + player.pulling.y + WORLD_SIZE_Y) % WORLD_SIZE_Y] = 0;
									player.pulling = {
										x: -newDirection.x,
										y: -newDirection.y
									};
								} else
									player.pulling = {
										x: 0,
										y: 0
									};
								player.position.x = (player.position.x + newDirection.x + WORLD_SIZE_X) % WORLD_SIZE_X;
								player.position.y = (player.position.y + newDirection.y + WORLD_SIZE_Y) % WORLD_SIZE_Y;
							}
						}
						player.direction = newDirection;
						if (player.direction.x === player.pulling.x && player.direction.y === player.pulling.y)
							player.pulling = {
								x: 0,
								y: 0
							};
						updateAllPlayers();
					}
					break;
				case 'pull':
					const oldPulling = { ...player.pulling };
					player.pulling = { ...player.direction };
					if (player.pulling.x !== oldPulling.x || player.pulling.y !== oldPulling.y)
						updateAllPlayers();
					break;
			}
		} catch (error) {
			console.log(error);
		}
	}).on('close', () => players.delete(uuid));
})
