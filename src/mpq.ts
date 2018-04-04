/**************************************************************
    This is a port of  
    https://github.com/nexus-devtools/empeeku 
    to typescript and modifies it to run in the browser

    https://github.com/nexus-devtools/empeeku is a fork of 
    https://github.com/Farof/mpyqjs which is a port of
    https://github.com/eagleflo/mpyq
  
 ***************************************************************/

// tslint:disable:no-bitwise
import { Buffer } from 'buffer';
import * as Long from 'long';
import { MPQUserDataHeader, MPQFileHeader, MPQFileHeaderExt, MPQBlockTableEntry, MPQHashTableEntry } from './data';
import * as compress from 'keybase-compressjs';

const hashTypes = {
    'TABLE_OFFSET': 0,
    'HASH_A': 1,
    'HASH_B': 2,
    'TABLE': 3
};

const MPQ_FILE_IMPLODE = 0x00000100;
const MPQ_FILE_COMPRESS = 0x00000200;
const MPQ_FILE_ENCRYPTED = 0x00010000;
const MPQ_FILE_FIX_KEY = 0x00020000;
const MPQ_FILE_SINGLE_UNIT = 0x01000000;
const MPQ_FILE_DELETE_MARKER = 0x02000000;
const MPQ_FILE_SECTOR_CRC = 0x04000000;
const MPQ_FILE_EXISTS = 0x80000000;

export class MPQArchive {

    private _data: Buffer;
    private _header: MPQFileHeader;

    private _hashTable: MPQHashTableEntry[];
    private _blockTable: MPQBlockTableEntry[];

    private _files: string[];

    private _encryptionTable = (function () {
        const table = {};
        let index: number;
        let seed = new Long.fromValue(0x00100001, true);
        for (let i = 0; i < 256; i++) {
            index = i;
            for (let j = 0; j < 5; j++) {
                seed = seed.mul(125).add(3).mod(0x2AAAAB);
                const t1 = seed.and(0xFFFF).shiftLeft(0x10);
                seed = seed.mul(125).add(3).mod(0x2AAAAB);
                const t2 = seed.and(0xFFFF);
                table[index] = t1.or(t2).toNumber();
                index += 0x100;
            }

        }
        return table;
    })();

    public get files(): string[] {
        return this._files;
    }

    public get header(): MPQFileHeader {
        return this._header;
    }

    public constructor(mpqData: ArrayBuffer, listFiles = true) {
        this._data = new Buffer(mpqData);
        this._header = this._readHeader();

        this._hashTable = this._readTable('hash');
        this._blockTable = this._readTable('block');

        if (listFiles) {
            const listFile = this.readFile('(listfile)');
            if (listFile) {
                this._files = listFile.toString('utf-8').trim().split('\r\n');
            }
        }
    }

    public printHeaders() {
        console.info('MPQ archive header');
        console.info('------------------');
        for (const key in this._header) {
            if (key === 'userDataHeader') { continue; }
            console.info(key + ' - ' + this._header[key]);
        }
        if (this._header.userDataHeader) {
            console.info();
            console.info('MPQ user data header');
            console.info('--------------------');
            console.info();
            // tslint:disable-next-line:forin
            for (const key in this._header.userDataHeader) {
                console.info(key + ' - ' + this._header.userDataHeader[key]);
            }
            console.info();
        }
    }

    public printHashTable() {
        console.info('MPQ archive hash table');
        console.info('----------------------');
        console.info('Hash A\t\tHash B\t\tLocl\tPlat\tBlockIdx');
        const format = [8, 8, 4, 4, 8];
        this._hashTable.forEach(entry => {
            console.info(Object.keys(entry).map((key, i) => {
                return this._formatWord(entry[key], format[i]);
            }).join('\t'));
        });
        console.info();
    };

    public printBlockTable() {
        console.info('MPQ archive block table');
        console.info('-----------------------');
        console.info('Offset\t\tArchSize\tRealSize\tFlags');
        this._blockTable.forEach(entry => {
            console.info([
                this._formatWord(entry.offset, 8),
                this._leadingChar(entry.archivedSize, ' ', 8),
                this._leadingChar(entry.size, ' ', 8),
                this._formatWord(entry.flags, 8)
            ].join('\t'));
        });
        console.info();
    };

    public readFile(filename: string, forceDecompress = false): Buffer {
        function decompress(data: Buffer): Buffer {
            const compressionType = data.readUInt8(0);
            if (compressionType === 0) {
                return data;
            } else if (compressionType === 2) {
                throw new Error('Unsupported compression type "zlib".');
            } else if (compressionType === 16) {
                return new Buffer(compress.Bzip2.decompressFile(data.slice(1)));
            } else {
                throw new Error('Unsupported compression type.');
            }
        }

        const hashEntry = this._getHashTableEntry(filename);
        if (!hashEntry) { return null; }
        const blockEntry = this._blockTable[hashEntry.blockTableIndex];
        if (blockEntry.flags & MPQ_FILE_EXISTS) {
            if (blockEntry.archivedSize === 0) { return null; }
            const offset = blockEntry.offset + this._header.offset;
            let fileData = this._data.slice(offset, offset + blockEntry.archivedSize);
            if (blockEntry.flags & MPQ_FILE_ENCRYPTED) {
                throw new Error('Encryption is not supported yet');
            }
            if (!(blockEntry.flags & MPQ_FILE_SINGLE_UNIT)) {
                const sectorSize = 512 << this._header.sectorSizeShift;
                let sectors = Math.trunc(blockEntry.size / sectorSize) + 1;
                let crc: boolean;
                if (blockEntry.flags & MPQ_FILE_SECTOR_CRC) {
                    crc = true;
                    sectors += 1;
                } else {
                    crc = false;
                }
                const positions = [];
                for (let i = 0; i < (sectors + 1); i++) {
                    positions[i] = fileData.readUInt32LE(4 * i);
                }
                const ln = positions.length - (crc ? 2 : 1);
                let result = new Buffer(0);
                let sectorBytesLeft = blockEntry.size;
                for (let i = 0; i < ln; i++) {
                    let sector = fileData.slice(positions[i], positions[i + 1]);
                    if ((blockEntry.flags & MPQ_FILE_COMPRESS) && (forceDecompress || (sectorBytesLeft > sector.length))) {
                        sector = decompress(sector);
                    }
                    sectorBytesLeft -= sector.length;
                    result = Buffer.concat([result, sector]);
                }
                fileData = result;
            } else {
                if ((blockEntry.flags & MPQ_FILE_COMPRESS) && (forceDecompress || (blockEntry.size > blockEntry.archivedSize))) {
                    fileData = decompress(fileData);
                }
            }
            return fileData;
        }
    }

    private _leadingChar(str: string | number, ch: string, ln: number, after = false): string {
        str = '' + str;
        while (str.length < ln) {
            str = after ? str + ch : ch + str;
        }
        return str;
    }

    private _formatWord(data: number, ln: number): string {
        return this._leadingChar(data.toString(16).toUpperCase(), '0', ln);
    }


    private _getHashTableEntry(filename: string): MPQHashTableEntry {
        const hashA = this._hash(filename, 'HASH_A');
        const hashB = this._hash(filename, 'HASH_B');
        for (const entry of this._hashTable) {
            if (entry.hashA === hashA && entry.hashB === hashB) {
                return entry;
            };
        }
        return undefined;
    }

    private _readHeader(): MPQFileHeader {
        let header: MPQFileHeader;

        const head = this._data.toString('utf-8', 0, 4);
        if (head === 'MPQ\x1a') {
            header = this._readMPQHeader();
            header.offset = 0;
        } else if (head === 'MPQ\x1b') {
            const userDataHeader = this._readMPQUserDataHeader();
            header = this._readMPQHeader(userDataHeader.mpqHeaderOffset);
            header.offset = userDataHeader.mpqHeaderOffset;
            header.userDataHeader = userDataHeader;
        } else {
            throw new Error('Invalid MPQ file header');
        }
        return header;
    }

    private _readMPQUserDataHeader(): MPQUserDataHeader {
        const data = this._data.slice(0, 16);
        const header = new MPQUserDataHeader(data);
        header.content = this._data.slice(16, 16 + header.userDataHeaderSize);
        return header;
    }

    private _readMPQHeader(offset = 0): MPQFileHeader {
        let data = this._data.slice(offset, offset + 32);
        let header = new MPQFileHeader(data);
        if (header.formatVersion === 1) {
            data = this._data.slice(offset + 32, offset + 32 + 12);
            header = <MPQFileHeader>Object.assign(new MPQFileHeaderExt(data), header);
        }
        return header;
    }

    private _readTable(tableType: 'hash'): MPQHashTableEntry[];
    private _readTable(tableType: 'block'): MPQBlockTableEntry[];
    private _readTable(tableType: 'hash' | 'block') {
        let type: any;
        switch (tableType) {
            case 'hash':
                type = MPQHashTableEntry;
                break;
            case 'block':
                type = type = MPQBlockTableEntry;
                break;
        }
        const tableOffset = this._header[tableType + 'TableOffset'];
        const tableEntries = this._header[tableType + 'TableEntries'];

        const key = this._hash('(' + tableType + ' table)', 'TABLE');
        let data = this._data.slice(tableOffset + this._header.offset, tableOffset + this._header.offset + tableEntries * 16);
        data = this._decrypt(data, key);
        const entries = [];
        for (let i = 0; i < tableEntries; i++) {
            entries[i] = new type(data.slice(i * 16, i * 16 + 16));
        }
        return entries;
    }

    private _hash(value: string, hashType: string): number {
        let seed1 = new Long.fromValue(0x7FED7FED, true);
        let seed2 = new Long.fromValue(0xEEEEEEEE, true);
        let result: any;
        let ch: any;
        for (ch of value.toUpperCase()) {
            if (isNaN(parseInt(ch, 10))) {
                ch = ch.codePointAt(0);
            }
            result = new Long.fromValue(this._encryptionTable[(hashTypes[hashType] << 8) + ch], true);
            seed1 = result.xor(seed1.add(seed2)).and(0xFFFFFFFF);
            seed2 = seed1.add(seed2).add(ch).add(seed2.shiftLeft(5)).add(3).and(0xFFFFFFFF);
        }

        return seed1.toNumber();
    }

    private _decrypt(data: Buffer, key: number): Buffer {
        const result = new Buffer(data.length);
        const ln = data.length / 4;
        let seed1 = new Long.fromValue(key, true);
        let seed2 = new Long.fromValue(0xEEEEEEEE, true);
        for (let i = 0; i < ln; i++) {
            // tslint:disable-next-line:no-bitwise
            seed2 = seed2.add(this._encryptionTable[0x400 + (seed1 & 0xFF)]);
            seed2 = seed2.and(0xFFFFFFFF);
            let value = new Long.fromValue(data.readUInt32LE(i * 4), true);
            value = value.xor(seed1.add(seed2)).and(0xFFFFFFFF);
            seed1 = seed1.xor(-1).shiftLeft(0x15).add(0x11111111).or(seed1.shiftRight(0x0B));
            seed1 = seed1.and(0xFFFFFFFF);
            seed2 = value.add(seed2).add(seed2.shiftLeft(5)).add(3).and(0xFFFFFFFF);
            result.writeUInt32BE(value.toNumber(), i * 4);
        }
        return result;
    }
}
