import { EventEmitter } from 'events';
import { Client as VezaClient, NodeMessage, ClientSocket } from 'veza';
import { Client, makeError } from 'discord.js';
import { IPCEvents } from '../Util/Constants';
import { IPCResult } from '..';
import { IPCError } from '../Sharding/ShardClientUtil';

export interface IPCRequest {
	op: number;
	d: string;
}

export class ClusterIPC extends EventEmitter {
	public clientSocket?: ClientSocket;
	public client: Client | typeof Client;
	public node: VezaClient;

	public constructor(discordClient: Client | typeof Client, public id: number, public socket: string | number) {
		super();
		this.client = discordClient;
		this.node = new VezaClient(`Cluster ${this.id}`)
			.on('error', error => this.emit('error', error))
			.on('disconnect', client => this.emit('warn', `[IPC] Disconnected from ${client.name}`))
			.on('ready', client => this.emit('debug', `[IPC] Connected to: ${client.name}`))
			// eslint-disable-next-line @typescript-eslint/no-misused-promises
			.on('message', this._message.bind(this));
	}

	public async broadcast(script: string | Function) {
		script = typeof script === 'function' ? `(${script})(this)` : script;
		const { success, d } = await this.server.send({ op: IPCEvents.BROADCAST, d: script }) as IPCResult;
		if (!success) throw makeError(d as IPCError);
		return d as unknown[];
	}

	public async masterEval(script: string | Function) {
		script = typeof script === 'function' ? `(${script})(this)` : script;
		const { success, d } = await this.server.send({ op: IPCEvents.MASTEREVAL, d: script }) as IPCResult;
		if (!success) throw makeError(d as IPCError);
		return d;
	}

	public async init() {
		this.clientSocket = await this.node.connectTo(String(this.socket));
	}

	public get server() {
		return this.clientSocket!;
	}

	private _eval(script: string): string {
		return (this.client as any)._eval(script);
	}

	private async _message(message: NodeMessage) {
		const { op, d } = message.data;
		if (op === IPCEvents.EVAL) {
			try {
				message.reply({ success: true, d: await this._eval(d as string) });
			} catch (error) {
				if (!(error instanceof Error)) return;
				message.reply({ success: false, d: { name: error.name, message: error.message, stack: error.stack } });
			}
		}
	}
}
