import {Transform} from "stream";

// Modified version of https://github.com/creationix/jsonparse and https://github.com/dominictarr/JSONStream
//   able to handle sequential concatenated JSON objects within a stream
//   modernized with TypeScript/Node 14+ streams API

// Named constants with unique integer values
export const TOKEN_CONSTANTS = {
    LEFT_BRACE: 0x1,
    RIGHT_BRACE: 0x2,
    LEFT_BRACKET: 0x3,
    RIGHT_BRACKET: 0x4,
    COLON: 0x5,
    COMMA: 0x6,
    TRUE: 0x7,
    FALSE: 0x8,
    NULL: 0x9,
    STRING: 0xa,
    NUMBER: 0xb,
// Tokenizer States
    START: 0x11,
    STOP: 0x12,
    TRUE1: 0x21,
    TRUE2: 0x22,
    TRUE3: 0x23,
    FALSE1: 0x31,
    FALSE2: 0x32,
    FALSE3: 0x33,
    FALSE4: 0x34,
    NULL1: 0x41,
    NULL2: 0x42,
    NULL3: 0x43,
    NUMBER1: 0x51,
    NUMBER3: 0x53,
    STRING1: 0x61,
    STRING2: 0x62,
    STRING3: 0x63,
    STRING4: 0x64,
    STRING5: 0x65,
    STRING6: 0x66,
// Parser States
    VALUE: 0x71,
    KEY: 0x72,
// Parser Modes
    MODE_ROOT: 0x80,
    MODE_OBJECT: 0x81,
    MODE_ARRAY: 0x82,
};

// Character constants
const BACK_SLASH = "\\".charCodeAt(0);
const FORWARD_SLASH = "\/".charCodeAt(0);
const BACKSPACE = "\b".charCodeAt(0);
const FORM_FEED = "\f".charCodeAt(0);
const NEWLINE = "\n".charCodeAt(0);
const CARRIAGE_RETURN = "\r".charCodeAt(0);
const TAB = "\t".charCodeAt(0);

const STRING_BUFFER_SIZE = 64 * 1024;

export interface StreamingJsonParserOptions {
    mapValue?: (value: any, path: any) => any;
}

export class StreamingJsonParser extends Transform {

    private tState: number = TOKEN_CONSTANTS.START;
    private value: any = {};

    private string: string;
    private readonly stringBuffer: Buffer;
    private stringBufferOffset: number = 0;
    private unicode;
    private highSurrogate;

    private key:any = "__root";
    private mode: number = TOKEN_CONSTANTS.MODE_ROOT;
    private stack: Array<any> = [];
    private state: number = TOKEN_CONSTANTS.VALUE;
    private bytes_remaining: number = 0; // number of bytes remaining in multi byte utf8 char to read after split boundary
    private bytes_in_sequence: number = 0; // bytes in multi byte utf8 char to read
    private readonly temp_buffs; // for rebuilding chars split before boundary is reached

    // Stream offset
    private offset = -1;

    private root: any;
    private readonly path: any;
    private count: number = 0;
    private header: any;
    private footer: any;

    private readonly options: StreamingJsonParserOptions;

    constructor(path: any, options?: StreamingJsonParserOptions) {
        super({
            readableObjectMode: true,
        });

        this.options = Object.assign({}, options);
        this.stringBuffer = Buffer.alloc(STRING_BUFFER_SIZE);
        this.temp_buffs = {
            "2": Buffer.alloc(2),
            "3": Buffer.alloc(3),
            "4": Buffer.alloc(4)
        };

        this.path = path;
        if ("string" === typeof path) {
            this.path = path.split(".").map(function (e) {
                if (e === "$*") {
                    return {emitKey: true};
                } else if (e === "*") {
                    return true;
                } else if (e === "") { // '..'.split('.') returns an empty string
                    return {recurse: true};
                } else {
                    return e;
                }
            });
        }

        if (!this.path || !this.path.length) {
            this.path = null
        }

        this.pushValue();
    }

    _transform(chunk, enc, callback) {
        this.writeChunk(chunk)
        callback();
    }

    _flush(callback) {
        if (this.header) {
            this.emit("header", this.header)
        }
        if (this.footer) {
            this.emit("footer", this.footer)
        }
        callback();
    }

    private static getTokenName(code: number) {
        const keys = Object.keys(TOKEN_CONSTANTS);
        for (let i = 0, l = keys.length; i < l; i++) {
            const key = keys[i];
            if (TOKEN_CONSTANTS[key] === code) {
                return key;
            }
        }
        return code && ("0x" + code.toString(16));
    }

    charError(buffer, i) {
        this.tState = TOKEN_CONSTANTS.STOP;
        this.onError(new Error("Unexpected " + JSON.stringify(String.fromCharCode(buffer[i])) + " at position " + i + " in state " + StreamingJsonParser.getTokenName(this.tState)));
    }

    appendStringChar(char) {
        if (this.stringBufferOffset >= STRING_BUFFER_SIZE) {
            this.string += this.stringBuffer.toString("utf8");
            this.stringBufferOffset = 0;
        }

        this.stringBuffer[this.stringBufferOffset++] = char;
    }

    appendStringBuf(buf, start?: number, end?: number) {
        let size = buf.length;
        if (typeof start === "number") {
            if (typeof end === "number") {
                if (end < 0) {
                    // adding a negative end decreases the size
                    size = buf.length - start + end;
                } else {
                    size = end - start;
                }
            } else {
                size = buf.length - start;
            }
        }

        if (size < 0) {
            size = 0;
        }

        if (this.stringBufferOffset + size > STRING_BUFFER_SIZE) {
            this.string += this.stringBuffer.toString("utf8", 0, this.stringBufferOffset);
            this.stringBufferOffset = 0;
        }

        buf.copy(this.stringBuffer, this.stringBufferOffset, start, end);
        this.stringBufferOffset += size;
    }

    private parseError(token, value) {
        this.tState = TOKEN_CONSTANTS.STOP;
        this.onError(new Error("Unexpected " + StreamingJsonParser.getTokenName(token) + (value ? ("(" + JSON.stringify(value) + ")") : "") + " in state " + StreamingJsonParser.getTokenName(this.state)));
    }

    pushValue() {
        this.stack.push({value: this.value, key: this.key, mode: this.mode});
    }

    popValue() {
        const value = this.value;
        const parent = this.stack.pop();
        this.value = parent.value;
        this.key = parent.key;
        this.mode = parent.mode;
        this.emitValue(value);
        if (!this.mode) {
            this.state = TOKEN_CONSTANTS.VALUE;
        }
    }

    emitValue(value) {
        if (this.mode) {
            this.state = TOKEN_CONSTANTS.MODE_ROOT === this.mode ? exports.TOKEN_CONSTANTS.VALUE : exports.TOKEN_CONSTANTS.COMMA;
        }
        this.onValue(value);
    }

    onToken(token, value) {
        if (this.stack.length === 1) {
            if (this.root) {
                if (!this.path) {
                    this.push(this.root);
                }
                this.count = 0;
                this.root = null;
            }
        }

        if (this.state === TOKEN_CONSTANTS.VALUE) {
            if (token === TOKEN_CONSTANTS.STRING || token === TOKEN_CONSTANTS.NUMBER || token === TOKEN_CONSTANTS.TRUE || token === TOKEN_CONSTANTS.FALSE || token === TOKEN_CONSTANTS.NULL) {
                if (this.value) {
                    this.value[this.key] = value;
                }
                this.emitValue(value);
            } else if (token === TOKEN_CONSTANTS.LEFT_BRACE) {
                this.pushValue();
                if (this.value) {
                    this.value = this.value[this.key] = {};
                } else {
                    this.value = {};
                }
                this.key = undefined;
                this.state = TOKEN_CONSTANTS.KEY;
                this.mode = TOKEN_CONSTANTS.MODE_OBJECT;
            } else if (token === TOKEN_CONSTANTS.LEFT_BRACKET) {
                this.pushValue();
                if (this.value) {
                    this.value = this.value[this.key] = [];
                } else {
                    this.value = [];
                }
                this.key = 0;
                this.mode = TOKEN_CONSTANTS.MODE_ARRAY;
                this.state = TOKEN_CONSTANTS.VALUE;
            } else if (token === TOKEN_CONSTANTS.RIGHT_BRACE) {
                if (this.mode === TOKEN_CONSTANTS.MODE_OBJECT) {
                    this.popValue();
                } else {
                    return this.parseError(token, value);
                }
            } else if (token === TOKEN_CONSTANTS.RIGHT_BRACKET) {
                if (this.mode === TOKEN_CONSTANTS.MODE_ARRAY) {
                    this.popValue();
                } else {
                    return this.parseError(token, value);
                }
            } else {
                return this.parseError(token, value);
            }
        } else if (this.state === TOKEN_CONSTANTS.KEY) {
            if (token === TOKEN_CONSTANTS.STRING) {
                this.key = value;
                this.state = TOKEN_CONSTANTS.COLON;
            } else if (token === TOKEN_CONSTANTS.RIGHT_BRACE) {
                this.popValue();
            } else {
                return this.parseError(token, value);
            }
        } else if (this.state === TOKEN_CONSTANTS.COLON) {
            if (token === TOKEN_CONSTANTS.COLON) {
                this.state = TOKEN_CONSTANTS.VALUE;
            } else {
                return this.parseError(token, value);
            }
        } else if (this.state === TOKEN_CONSTANTS.COMMA) {
            if (token === TOKEN_CONSTANTS.COMMA) {
                if (this.mode === TOKEN_CONSTANTS.MODE_ARRAY) {
                    this.key++;
                    this.state = TOKEN_CONSTANTS.VALUE;
                } else if (this.mode === TOKEN_CONSTANTS.MODE_OBJECT) {
                    this.state = TOKEN_CONSTANTS.KEY;
                }
            } else if (token === TOKEN_CONSTANTS.RIGHT_BRACKET && this.mode === TOKEN_CONSTANTS.MODE_ARRAY || token === TOKEN_CONSTANTS.RIGHT_BRACE && this.mode === TOKEN_CONSTANTS.MODE_OBJECT) {
                this.popValue();
            } else {
                return this.parseError(token, value);
            }
        } else {
            return this.parseError(token, value);
        }
    }

    // Any value returned is treated as error and will interrupt parsing.
    numberReviver(text, buffer, i): any {
        const result = Number(text);

        if (isNaN(result)) {
            return this.charError(buffer, i);
        }

        if ((text.match(/[0-9]+/) == text) && (result.toString() != text)) {
            // Long string of digits which is an ID string and not valid and/or safe JavaScript integer Number
            this.onToken(TOKEN_CONSTANTS.STRING, text);
        } else {
            this.onToken(TOKEN_CONSTANTS.NUMBER, result);
        }
    }

    onError(err) {
        if (err.message.indexOf("at position") > -1) {
            err.message = "Invalid JSON (" + err.message + ")";
        }
        this.emit("error", err);
    }

    onValue(value) {
        if (!this.root) {
            this.root = value
        }

        if (!this.path) {
            return;
        }

        let i = 0 // iterates on path
        let j = 0 // iterates on stack
        let emitKey = false;
        let emitPath = false;
        while (i < this.path.length) {
            const key = this.path[i]
            let c
            j++

            if (key && !key.recurse) {
                c = (j === this.stack.length) ? this : this.stack[j]
                if (!c) return
                if (!this.check(key, c.key)) {
                    this.setHeaderFooter(c.key, value)
                    return
                }
                emitKey = !!key.emitKey;
                emitPath = !!key.emitPath;
                i++
            } else {
                i++
                const nextKey = this.path[i]
                if (!nextKey) return
                while (true) {
                    c = (j === this.stack.length) ? this : this.stack[j]
                    if (!c) return
                    if (this.check(nextKey, c.key)) {
                        i++;
                        if (!Object.isFrozen(this.stack[j]))
                            this.stack[j].value = null
                        break
                    } else {
                        this.setHeaderFooter(c.key, value)
                    }
                    j++
                }
            }

        }

        // emit header
        if (this.header) {
            this.emit("header", this.header);
            this.header = false;
        }
        if (j !== this.stack.length) {
            return;
        }

        this.count++
        const actualPath = this.stack.slice(1).map(function (element) {
            return element.key
        }).concat([this.key])

        if (null !== value) {
            let data = this.options.mapValue ? this.options.mapValue(value, actualPath) : value;
            if (null !== data) {
                if (emitKey || emitPath) {
                    data = {value: data};
                    if (emitKey) {
                        data["key"] = this.key;
                    }
                    if (emitPath) {
                        data["path"] = actualPath;
                    }
                }

                this.push(data)
            }
        }
        if (this.value) {
            delete this.value[this.key];
        }
        for (const k in this.stack) {
            if (!Object.isFrozen(this.stack[k])) {
                this.stack[k].value = null;
            }
        }
    }

    setHeaderFooter(key, value) {
        // header has not been emitted yet
        if (this.header !== false) {
            this.header = this.header || {}
            this.header[key] = value
        }

        // footer has not been emitted yet but header has
        if (this.footer !== false && this.header === false) {
            this.footer = this.footer || {}
            this.footer[key] = value
        }
    }

    check(x, y) {
        if ("string" === typeof x) {
            return y === x;
        } else if (x && "function" === typeof x.exec) {
            return x.exec(y);
        } else if ("boolean" === typeof x || "object" === typeof x) {
            return x;
        } else if ("function" === typeof x) {
            return x(y);
        }
        return false;
    }

    writeChunk(buffer) {
        if (typeof buffer === "string") {
            buffer = new Buffer(buffer);
        }
        let n;
        for (let i = 0, l = buffer.length; i < l; i++) {
            if (this.tState === TOKEN_CONSTANTS.START) {
                n = buffer[i];
                this.offset++;
                if (n === 0x7b) {
                    this.onToken(TOKEN_CONSTANTS.LEFT_BRACE, "{"); // {
                } else if (n === 0x7d) {
                    this.onToken(TOKEN_CONSTANTS.RIGHT_BRACE, "}"); // }
                } else if (n === 0x5b) {
                    this.onToken(TOKEN_CONSTANTS.LEFT_BRACKET, "["); // [
                } else if (n === 0x5d) {
                    this.onToken(TOKEN_CONSTANTS.RIGHT_BRACKET, "]"); // ]
                } else if (n === 0x3a) {
                    this.onToken(TOKEN_CONSTANTS.COLON, ":");  // :
                } else if (n === 0x2c) {
                    this.onToken(TOKEN_CONSTANTS.COMMA, ","); // ,
                } else if (n === 0x74) {
                    this.tState = TOKEN_CONSTANTS.TRUE1;  // t
                } else if (n === 0x66) {
                    this.tState = TOKEN_CONSTANTS.FALSE1;  // f
                } else if (n === 0x6e) {
                    this.tState = TOKEN_CONSTANTS.NULL1; // n
                } else if (n === 0x22) { // "
                    this.string = "";
                    this.stringBufferOffset = 0;
                    this.tState = TOKEN_CONSTANTS.STRING1;
                } else if (n === 0x2d) {
                    this.string = "-";
                    this.tState = TOKEN_CONSTANTS.NUMBER1; // -
                } else {
                    if (n >= 0x30 && n < 0x40) { // 1-9
                        this.string = String.fromCharCode(n);
                        this.tState = TOKEN_CONSTANTS.NUMBER3;
                    } else if (n === 0x20 || n === 0x09 || n === 0x0a || n === 0x0d) {
                        // whitespace
                    } else {
                        return this.charError(buffer, i);
                    }
                }
            } else if (this.tState === TOKEN_CONSTANTS.STRING1) { // After open quote
                n = buffer[i]; // get current byte from buffer
                // check for carry over of a multi byte char split between data chunks
                // & fill temp buffer it with start of this data chunk up to the boundary limit set in the last iteration
                if (this.bytes_remaining > 0) {
                    let j;
                    for (j = 0; j < this.bytes_remaining; j++) {
                        this.temp_buffs[this.bytes_in_sequence][this.bytes_in_sequence - this.bytes_remaining + j] = buffer[j];
                    }

                    this.appendStringBuf(this.temp_buffs[this.bytes_in_sequence]);
                    this.bytes_in_sequence = this.bytes_remaining = 0;
                    i = i + j - 1;
                } else if (this.bytes_remaining === 0 && n >= 128) { // else if no remainder bytes carried over, parse multi byte (>=128) chars one at a time
                    if (n <= 193 || n > 244) {
                        return this.onError(new Error(`Invalid UTF-8 character at position ${i} in state ${StreamingJsonParser.getTokenName(this.tState)}`));
                    }
                    if ((n >= 194) && (n <= 223)) this.bytes_in_sequence = 2;
                    if ((n >= 224) && (n <= 239)) this.bytes_in_sequence = 3;
                    if ((n >= 240) && (n <= 244)) this.bytes_in_sequence = 4;
                    if ((this.bytes_in_sequence + i) > buffer.length) { // if bytes needed to complete char fall outside buffer length, we have a boundary split
                        for (let k = 0; k <= (buffer.length - 1 - i); k++) {
                            this.temp_buffs[this.bytes_in_sequence][k] = buffer[i + k]; // fill temp buffer of correct size with bytes available in this chunk
                        }
                        this.bytes_remaining = (i + this.bytes_in_sequence) - buffer.length;
                        i = buffer.length - 1;
                    } else {
                        this.appendStringBuf(buffer, i, i + this.bytes_in_sequence);
                        i = i + this.bytes_in_sequence - 1;
                    }
                } else if (n === 0x22) {
                    this.tState = TOKEN_CONSTANTS.START;
                    this.string += this.stringBuffer.toString("utf8", 0, this.stringBufferOffset);
                    this.stringBufferOffset = 0;
                    this.onToken(TOKEN_CONSTANTS.STRING, this.string);
                    this.offset += Buffer.byteLength(this.string, "utf8") + 1;
                    this.string = undefined;
                } else if (n === 0x5c) {
                    this.tState = TOKEN_CONSTANTS.STRING2;
                } else if (n >= 0x20) {
                    this.appendStringChar(n);
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.STRING2) { // After backslash
                n = buffer[i];
                if (n === 0x22) {
                    this.appendStringChar(n);
                    this.tState = TOKEN_CONSTANTS.STRING1;
                } else if (n === 0x5c) {
                    this.appendStringChar(BACK_SLASH);
                    this.tState = TOKEN_CONSTANTS.STRING1;
                } else if (n === 0x2f) {
                    this.appendStringChar(FORWARD_SLASH);
                    this.tState = TOKEN_CONSTANTS.STRING1;
                } else if (n === 0x62) {
                    this.appendStringChar(BACKSPACE);
                    this.tState = TOKEN_CONSTANTS.STRING1;
                } else if (n === 0x66) {
                    this.appendStringChar(FORM_FEED);
                    this.tState = TOKEN_CONSTANTS.STRING1;
                } else if (n === 0x6e) {
                    this.appendStringChar(NEWLINE);
                    this.tState = TOKEN_CONSTANTS.STRING1;
                } else if (n === 0x72) {
                    this.appendStringChar(CARRIAGE_RETURN);
                    this.tState = TOKEN_CONSTANTS.STRING1;
                } else if (n === 0x74) {
                    this.appendStringChar(TAB);
                    this.tState = TOKEN_CONSTANTS.STRING1;
                } else if (n === 0x75) {
                    this.unicode = "";
                    this.tState = TOKEN_CONSTANTS.STRING3;
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.STRING3 || this.tState === TOKEN_CONSTANTS.STRING4 || this.tState === TOKEN_CONSTANTS.STRING5 || this.tState === TOKEN_CONSTANTS.STRING6) { // unicode hex codes
                n = buffer[i];
                // 0-9 A-F a-f
                if ((n >= 0x30 && n < 0x40) || (n > 0x40 && n <= 0x46) || (n > 0x60 && n <= 0x66)) {
                    this.unicode += String.fromCharCode(n);
                    if (this.tState++ === TOKEN_CONSTANTS.STRING6) {
                        const intVal = parseInt(this.unicode, 16);
                        this.unicode = undefined;
                        if (this.highSurrogate !== undefined && intVal >= 0xDC00 && intVal < (0xDFFF + 1)) { //<56320,57343> - lowSurrogate
                            this.appendStringBuf(new Buffer(String.fromCharCode(this.highSurrogate, intVal)));
                            this.highSurrogate = undefined;
                        } else if (this.highSurrogate === undefined && intVal >= 0xD800 && intVal < (0xDBFF + 1)) { //<55296,56319> - highSurrogate
                            this.highSurrogate = intVal;
                        } else {
                            if (this.highSurrogate !== undefined) {
                                this.appendStringBuf(new Buffer(String.fromCharCode(this.highSurrogate)));
                                this.highSurrogate = undefined;
                            }
                            this.appendStringBuf(new Buffer(String.fromCharCode(intVal)));
                        }
                        this.tState = TOKEN_CONSTANTS.STRING1;
                    }
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.NUMBER1 || this.tState === TOKEN_CONSTANTS.NUMBER3) {
                n = buffer[i];

                switch (n) {
                    case 0x30: // 0
                    case 0x31: // 1
                    case 0x32: // 2
                    case 0x33: // 3
                    case 0x34: // 4
                    case 0x35: // 5
                    case 0x36: // 6
                    case 0x37: // 7
                    case 0x38: // 8
                    case 0x39: // 9
                    case 0x2e: // .
                    case 0x65: // e
                    case 0x45: // E
                    case 0x2b: // +
                    case 0x2d: // -
                        this.string += String.fromCharCode(n);
                        this.tState = TOKEN_CONSTANTS.NUMBER3;
                        break;
                    default:
                        this.tState = TOKEN_CONSTANTS.START;
                        const error = this.numberReviver(this.string, buffer, i);
                        if (error) {
                            return error;
                        }

                        this.offset += this.string.length - 1;
                        this.string = undefined;
                        i--;
                        break;
                }
            } else if (this.tState === TOKEN_CONSTANTS.TRUE1) { // r
                if (buffer[i] === 0x72) {
                    this.tState = TOKEN_CONSTANTS.TRUE2;
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.TRUE2) { // u
                if (buffer[i] === 0x75) {
                    this.tState = TOKEN_CONSTANTS.TRUE3;
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.TRUE3) { // e
                if (buffer[i] === 0x65) {
                    this.tState = TOKEN_CONSTANTS.START;
                    this.onToken(TOKEN_CONSTANTS.TRUE, true);
                    this.offset += 3;
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.FALSE1) { // a
                if (buffer[i] === 0x61) {
                    this.tState = TOKEN_CONSTANTS.FALSE2;
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.FALSE2) { // l
                if (buffer[i] === 0x6c) {
                    this.tState = TOKEN_CONSTANTS.FALSE3;
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.FALSE3) { // s
                if (buffer[i] === 0x73) {
                    this.tState = TOKEN_CONSTANTS.FALSE4;
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.FALSE4) { // e
                if (buffer[i] === 0x65) {
                    this.tState = TOKEN_CONSTANTS.START;
                    this.onToken(TOKEN_CONSTANTS.FALSE, false);
                    this.offset += 4;
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.NULL1) { // u
                if (buffer[i] === 0x75) {
                    this.tState = TOKEN_CONSTANTS.NULL2;
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.NULL2) { // l
                if (buffer[i] === 0x6c) {
                    this.tState = TOKEN_CONSTANTS.NULL3;
                } else {
                    return this.charError(buffer, i);
                }
            } else if (this.tState === TOKEN_CONSTANTS.NULL3) { // l
                if (buffer[i] === 0x6c) {
                    this.tState = TOKEN_CONSTANTS.START;
                    this.onToken(TOKEN_CONSTANTS.NULL, null);
                    this.offset += 3;
                } else {
                    return this.charError(buffer, i);
                }
            }
        }
    }
}
