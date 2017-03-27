import * as _ from 'lodash';

export class TypeUtil {
  public static isNone(value: any): boolean {
    return ('undefined' === (typeof value)) || _.isNull(value);
  }

  public static isString(value: any): boolean {
    return _.isString(value);
  }

  public static isNumber(value: any): boolean {
    return _.isNumber(value);
  }

  public static isArray(value: any): boolean {
    return _.isArray(value);
  }

  public static isObject(value: any): boolean {
    return _.isObject(value);
  }

  public static isFunction(value: any): boolean {
    return _.isFunction(value);
  }
}