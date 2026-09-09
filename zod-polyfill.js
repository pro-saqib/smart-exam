import * as ZodLib from "./node_modules/zod/index.js";

const { ZodType, ZodObject, ZodString } = ZodLib;

if (ZodType && ZodType.prototype && !ZodType.prototype.meta) {
  ZodType.prototype.meta = function (meta) {
    this._def.meta = meta;
    return this;
  };
}

if (ZodObject && ZodObject.prototype && !ZodObject.prototype.loose) {
  ZodObject.prototype.loose = function () {
    return this.passthrough();
  };
}

export * from "./node_modules/zod/index.js";

export const email = () => ZodLib.string().email();
export const url = () => ZodLib.string().url();
export const uuid = () => ZodLib.string().uuid();
export const ipv4 = () => ZodLib.string().ip({ version: "v4" });
export const ipv6 = () => ZodLib.string().ip({ version: "v6" });
export const ip = (opts) => ZodLib.string().ip(opts);
export const looseObject = (shape) => (ZodLib.object ? ZodLib.object(shape).passthrough() : shape);

export default {
  ...ZodLib,
  email: () => ZodLib.string().email(),
  url: () => ZodLib.string().url(),
  uuid: () => ZodLib.string().uuid(),
  ipv4: () => ZodLib.string().ip({ version: "v4" }),
  ipv6: () => ZodLib.string().ip({ version: "v6" }),
  ip: (opts) => ZodLib.string().ip(opts),
  looseObject: (shape) => (ZodLib.object ? ZodLib.object(shape).passthrough() : shape),
};
