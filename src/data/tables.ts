import { Buffer } from 'buffer';

export class MPQHashTableEntry {
    public hashA: number;
    public hashB: number;
    public locale: number;
    public platform: number;
    public blockTableIndex: number;

    public constructor(data: Buffer) {
        this.hashA = data.readUInt32BE(0);
        this.hashB = data.readUInt32BE(4);
        this.locale = data.readUInt16BE(8);
        this.platform = data.readUInt16BE(10);
        this.blockTableIndex = data.readUInt32BE(12);
    }
}

export class MPQBlockTableEntry {
    public offset: number;
    public archivedSize: number;
    public size: number;
    public flags: number;
    public constructor(data: Buffer) {
        this.offset = data.readUInt32BE(0);
        this.archivedSize = data.readUInt32BE(4);
        this.size = data.readUInt32BE(8);
        this.flags = data.readUInt32BE(12);
    }
}
