import { parse, SuccessfulParsedMessage } from 'discord-command-parser';
import { Client, Message } from 'discord.js';
import { ParsedArgs } from 'minimist';
import { Interface } from 'readline';
import { Logger } from 'winston';
import { IBotConfig, IBotPlugin } from '../models';
import { ConsoleReader } from '../console-reader';
import { CommandMap, readDir, requireFile, projectDir } from '../helpers';
import { clone, fuse } from '../iteration';
import { generateLogger } from '../logger';

process.on('unhandledRejection', error => console.error('Uncaught Promise Rejection', error));

export abstract class IBot<T extends IBotConfig> {
    online: boolean;
    readonly config: T;
    readonly logger: Logger;
    readonly client: Client;
    readonly commands: CommandMap<(cmd: SuccessfulParsedMessage<Message>, msg: Message) => void>;
    readonly console: ConsoleReader;
    readonly plugins: IBotPlugin[];

    constructor(config: T, defaults: T) {
        this.config = fuse(clone(defaults), config);
        this.logger = generateLogger(projectDir(this.config.directory.logs));
        this.commands = new CommandMap();
        this.console = new ConsoleReader(this.logger);
        this.console.commands
            .on('exit', (args: ParsedArgs, rl: Interface) => {
                if(this.client)
                    this.client.destroy();
                rl.close();
            });
        this.client = new Client()
            .on('ready', () => {
                this.logger.debug('Bot Online');
                this.online = true;
                this.onReady(this.client);
                if (!!this.plugins) {
                    this.plugins.forEach(plugin => plugin.onReady(this.client));
                }
            })
            .on('disconnect', () => {
                this.online = false;
                this.logger.debug('Bot Disconnected');
            })
            .on('error', (error: Error) => {
                this.logger.error(error);
                console.log(error);
            })
            .on('message', (msg: Message) => {
                this.preMessage(msg);
                let parsed = parse(msg, this.config.command.symbol);
                if(!parsed.success) return;
                this.parsedMessage(parsed);
                let handlers = this.commands.get(parsed.command);
                if(handlers) {
                    this.logger.debug(`Bot Command: ${msg.content}`);
                    handlers.forEach(handle => {
                        handle(parsed as SuccessfulParsedMessage<Message>, msg);
                    });
                }
                this.postMessage(msg);
            });
        this.onClientCreated(this.client);
        this.onRegisterConsoleCommands(this.console.commands);
        this.onRegisterDiscordCommands(this.commands);

        let files = readDir(this.config.directory.plugins);
        if(!!files) {
            this.plugins = files
                .filter(file => !file.endsWith('.map'))
                .map(file => requireFile(this.config.directory.plugins, file).default)
                .map(construct => new construct());
            this.plugins.forEach(plugin => {
                plugin.preInitialize(this);
                plugin.clientBound(this.client);
                plugin.registerConsoleCommands(this.console.commands);
                plugin.registerDiscordCommands(this.commands);
                plugin.postInitialize(this);
            });
        }
    }

    abstract onRegisterConsoleCommands(map: CommandMap<(args: ParsedArgs, rl: Interface) => void>): void;

    abstract onRegisterDiscordCommands(map: CommandMap<(cmd: SuccessfulParsedMessage<Message>, msg: Message) => void>): void;

    abstract onClientCreated(client: Client): void;

    abstract onReady(client: Client): void;

    preMessage(msg: Message) { }

    parsedMessage(msg: SuccessfulParsedMessage<Message>) { }

    postMessage(msg: Message) { }

    connect() {
        return this.client.login(this.config.discord.token);
    }

    listen() {
        return this.console.listen();
    }
}
