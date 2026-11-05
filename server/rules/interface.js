/**
 * Rules module shape (JSDoc). Swap sandbox.js → mafia.js later.
 *
 * @typedef {object} Player
 * @property {string} id
 * @property {string} name
 * @property {number} seatId
 * @property {"human"|"bot"} kind
 * @property {boolean} host
 * @property {boolean} alive
 * @property {string[]} tags
 * @property {Record<string, unknown>} [meta]
 *
 * @typedef {object} RoomState
 * @property {string} phase
 * @property {Map<string, Player>|Record<string, Player>} players
 * @property {Record<string, Array<{ fromSeat: number, name: string, text: string, ts: number }>>} channels
 *
 * @typedef {object} Rules
 * @property {() => string[]} phases
 * @property {() => string} initialPhase
 * @property {(room: RoomState) => void} [onStart]
 * @property {(room: RoomState, player: Player) => void} [onJoin]
 * @property {(player: Player, channel: string, room: RoomState) => boolean} canSay
 * @property {(player: Player, type: string, room: RoomState) => boolean} canAct
 * @property {(player: Player, room: RoomState) => string[]} visibleChannels
 * @property {(viewer: Player, seatPlayer: Player) => Record<string, unknown>} publicSeatFields
 * @property {(room: RoomState, player: Player, type: string, payload: unknown) => { ok: boolean, error?: string }} [onAct]
 * @property {(player: Player, view: object) => string} botPrompt
 */

module.exports = {};
