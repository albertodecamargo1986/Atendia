"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
exports.sign2FATempToken = sign2FATempToken;
exports.verify2FATempToken = verify2FATempToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const index_js_1 = require("../config/index.js");
function signAccessToken(payload) {
    const opts = { expiresIn: '15m' };
    return jsonwebtoken_1.default.sign(payload, (0, index_js_1.getConfig)().JWT_SECRET, opts);
}
function signRefreshToken(payload) {
    const opts = { expiresIn: '30d' };
    return jsonwebtoken_1.default.sign(payload, (0, index_js_1.getConfig)().JWT_REFRESH_SECRET, opts);
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, (0, index_js_1.getConfig)().JWT_SECRET);
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, (0, index_js_1.getConfig)().JWT_REFRESH_SECRET);
}
function sign2FATempToken(payload) {
    return jsonwebtoken_1.default.sign(payload, (0, index_js_1.getConfig)().JWT_SECRET, { expiresIn: '5m' });
}
function verify2FATempToken(token) {
    return jsonwebtoken_1.default.verify(token, (0, index_js_1.getConfig)().JWT_SECRET);
}
//# sourceMappingURL=jwt.js.map