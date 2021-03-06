import axios, { AxiosResponse } from 'axios';
import { Promise } from 'bluebird';
import { ChildProcess } from 'child_process';
import { classToPlain } from 'class-transformer';
import { addYears, subYears } from 'date-fns';
import * as fs from 'fs-extra';
import * as _ from 'lodash';
import * as path from 'path';
import { Between, FindOperator } from 'typeorm';
import { inspect } from 'util';

export const isProductionEnv = process.env.NODE_ENV === 'production';
export const isTestEnv = process.env.NODE_ENV === 'test';

export function AfterDate(date: Date): FindOperator<any> {
  return Between(date, addYears(date, 100));
}

export function BeforeDate(date: Date): FindOperator<any> {
  return Between(subYears(date, 100), date);
}

export function execAsync(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    child.addListener('error', reject);
    child.addListener('exit', resolve);
  });
}

export function r(
  o: any,
  { transform, stringify, depth }: { transform?: boolean; stringify?: boolean; depth?: number } = {},
): string {
  if (!_.isObjectLike(o)) {
    return o;
  }
  const value = transform || stringify ? classToPlain(o) : o;
  return isProductionEnv || stringify ? JSON.stringify(value) : inspect(value, { colors: true, depth: depth ?? 5 });
}

/**
 * https://www.typescriptlang.org/docs/handbook/mixins.html
 * @param derivedCtor
 * @param baseCtors
 */
export function applyMixins(derivedCtor: any, baseCtors: any[]): void {
  baseCtors.forEach(baseCtor => {
    Object.getOwnPropertyNames(baseCtor.prototype).forEach(name => {
      Object.defineProperty(derivedCtor.prototype, name, Object.getOwnPropertyDescriptor(baseCtor.prototype, name));
    });
  });
}

export async function download(url: string, to: string): Promise<AxiosResponse> {
  fs.ensureDirSync(path.dirname(to));
  const dir = path.resolve(to);
  const writer = fs.createWriteStream(dir);

  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    timeout: 60000,
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

export function fixedPath(name: string, length = 32, pos = 0): string {
  if (name.length > length && name.includes('.')) {
    const next = name.indexOf('.', pos);
    if (next !== -1) {
      const start = name.slice(0, pos);
      const middle = name.slice(pos, pos + 1);
      const end = name.slice(next);
      const prefix = `${start}${middle}`;
      const normalized = `${prefix}${end}`;
      return fixedPath(normalized, length, prefix.length + 1);
    }
  }
  return name;
}

// TODO make only safe dirs can be list
export function traverseDir(dir: string): string[] {
  const dirs = [];
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
      dirs.push(...traverseDir(fullPath));
    } else {
      dirs.push(fullPath);
    }
  });
  return dirs;
}

export function resolveBasename(dir: string, withExt = false): string {
  if (!_.isString(dir)) {
    return dir;
  }
  return withExt ? path.basename(dir) : path.basename(dir).replace(/\.[^./]+$/, '');
}

/**
 * 在一个区间内取值，num 大于 max 时返回 max，num 小于 max 时返回 min
 */
export function numberInterval(min: number, max: number, num: number): number {
  return _.max([_.min([max, num]), min]);
}

export function parseJSONIfCould(value?: string): any {
  try {
    if (value) return JSON.parse(value);
    // eslint-disable-next-line no-empty
  } catch (e) {}
  return value;
}

export function promisify<T extends (...args) => R, R>(fn: T, bind?): (...args: Parameters<T>) => Promise<R> {
  return Promise.promisify(fn).bind(bind);
}
