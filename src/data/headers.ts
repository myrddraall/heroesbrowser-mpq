import { Buffer } from 'buffer';

export class MPQUserDataHeader {
    public magic: string;
    public userDataSize: number;
    public mpqHeaderOffset: number;
    public userDataHeaderSize: number;
    public content: Buffer;

    public constructor(data: Buffer) {
        this.magic = data.toString('utf8', 0, 4);
        this.userDataSize = data.readUInt32LE(4);
        this.mpqHeaderOffset = data.readUInt32LE(8);
        this.userDataHeaderSize = data.readUInt32LE(12);
    }

}

export class MPQFileHeader {
    public magic: string;
    public headerSize: number;
    public archiveSize: number;
    public sectorSizeShift: number;
    public hashTableOffset: number;
    public blockTableOffset: number;
    public hashTableEntries: number;
    public blockTableEntries: number;
    public offset: number;
    public formatVersion: number;
    public userDataHeader: MPQUserDataHeader;
    public constructor(data: Buffer) {
        if (data) {
            this.magic = data.toString('utf8', 0, 4);
            this.headerSize = data.readUInt32LE(4);
            this.archiveSize = data.readUInt32LE(8);
            this.formatVersion = data.readUInt16LE(12);
            this.sectorSizeShift = data.readUInt16LE(14);
            this.hashTableOffset = data.readUInt32LE(16);
            this.blockTableOffset = data.readUInt32LE(20);
            this.hashTableEntries = data.readUInt32LE(24);
            this.blockTableEntries = data.readUInt32LE(28);
        }
    }
}

export class MPQFileHeaderExt extends MPQFileHeader {
    public extendedBlockTableOffset: number;
    public hashTableOffsetHigh: number;
    public blockTableOffsetHigh: number;

    public constructor(data: Buffer) {
        super(null);
        this.extendedBlockTableOffset = data.readIntLE(0, 8);
        this.hashTableOffsetHigh = data.readInt8(8);
        this.blockTableOffsetHigh = data.readInt8(10);
    }
}
