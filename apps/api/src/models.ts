import mongoose, { Schema, Types } from 'mongoose';
const { model } = mongoose;
const oid = (ref: string) => ({ type: Schema.Types.ObjectId, ref, required: true });

export const User = model('User', new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  displayName: { type: String, required: true, trim: true, maxlength: 40 },
}, { timestamps: true }));

export const RefreshToken = model('RefreshToken', new Schema({
  userId: oid('User'), tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}));

export const PasswordReset = model('PasswordReset', new Schema({
  userId: oid('User'), tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
}));

const gameSub = new Schema({
  gameId: { type: String, required: true },          // preset id, or "custom:<n>"
  active: { type: Boolean, default: true },          // false = archived; history stays readable
  custom: { type: Boolean, default: false },
  name: String, description: String, inputHint: String,
}, { _id: false });

export const Group = model('Group', new Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, default: '', maxlength: 300 },
  ownerId: oid('User'),
  mainColor: { type: String, default: '#0f1b3d', match: /^#[0-9a-f]{6}$/i },
  accentColor: { type: String, default: '#ffffff', match: /^#[0-9a-f]{6}$/i },
  timezone: { type: String, default: 'UTC' },
  games: [gameSub],
  customCounter: { type: Number, default: 0 },
}, { timestamps: true }));

export const Membership = model('Membership', new Schema({
  groupId: oid('Group'), userId: oid('User'),
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
}, { timestamps: true }).index({ groupId: 1, userId: 1 }, { unique: true }).index({ userId: 1 }));

export const Invitation = model('Invitation', new Schema({
  groupId: oid('Group'), code: { type: String, required: true, unique: true },
  createdBy: oid('User'), expiresAt: Date, revoked: { type: Boolean, default: false },
}, { timestamps: true }));

export const Submission = model('Submission', new Schema({
  groupId: oid('Group'), userId: oid('User'),
  gameId: { type: String, required: true }, date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  raw: { type: String, required: true, maxlength: 100 },
  value: Number, success: { type: Boolean, required: true },
  points: { type: Number, default: null },           // null for custom games (no championship points)
  scoringVersion: { type: Number, default: 1 },
}, { timestamps: true }).index({ groupId: 1, userId: 1, gameId: 1, date: 1 }, { unique: true }).index({ groupId: 1, date: 1 }));

export const Championship = model('Championship', new Schema({
  groupId: oid('Group'), month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  championId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  scoringVersion: { type: Number, default: 1 },
  standings: [{ type: Schema.Types.Mixed }],
}, { timestamps: true }).index({ groupId: 1, month: 1 }, { unique: true }));

export type Id = Types.ObjectId | string;
