import axios from 'axios';
import { Promise } from 'bluebird';
import * as Chance from 'chance';
import * as crypto from 'crypto';
import * as _ from 'lodash';
import * as qs from 'qs';
import * as xml2js from 'xml2js';
import { AsunaErrorCode, AsunaException, r } from '../common';
import { LoggerFactory } from '../common/logger';
import { ConfigKeys, configLoader } from '../config';
import { PaymentMethod } from './payment.entities';

const logger = LoggerFactory.getLogger('PaymentWxpayHelper');
const chance = new Chance();

export class PaymentWxpayHelper {
  static async createOrder(
    method: PaymentMethod,
    goods: {
      // 商户系统内部订单号，要求32个字符内，只能是数字、大小写字母_-|* 且在同一个商户号下唯一。
      tradeNo: string;
      name: string;
      fee: number;
      clientIp: string;
    },
    returnUrl?: string,
  ): Promise<string> {
    const MASTER_HOST = configLoader.loadConfig(ConfigKeys.MASTER_ADDRESS);
    const notify_url = _.get(method.extra, 'notifyUrl') || `${MASTER_HOST}/api/v1/payment/notify`;
    if (_.isEmpty(notify_url)) {
      throw new AsunaException(AsunaErrorCode.Unprocessable, 'no notify url defined.');
    }

    const total_fee = _.toNumber(goods.fee) * 100;
    const signObject = {
      appid: method.apiKey,
      mch_id: method.merchant,
      device_info: 'WEB',
      body: goods.name,
      nonce_str: chance.string({ length: 32, alpha: true, numeric: true }),
      out_trade_no: goods.tradeNo,
      total_fee,
      trade_type: 'MWEB',
      spbill_create_ip: goods.clientIp,
      notify_url,
    };
    const secretKey = _.get(method.extra, 'secretKey') as string;
    if (_.isEmpty(secretKey)) {
      throw new AsunaException(AsunaErrorCode.Unprocessable, `secretKey not found`);
    }
    const signStr = `${qs.stringify(signObject, {
      encode: false,
      sort: (a, b) => a.localeCompare(b),
    })}&key=${secretKey}`;
    const sign = crypto.createHash('md5').update(signStr).digest('hex').toUpperCase();

    const postBody = { ...signObject, sign };

    const xmlData = new xml2js.Builder({
      xmldec: null,
      rootName: 'xml',
      // allowSurrogateChars: true,
      cdata: true,
    }).buildObject(postBody);

    logger.verbose(`signed ${r({ signObject, signStr, sign, postBody, xmlData, notify_url })}`);
    const response = await axios.post(method.endpoint, xmlData);
    const json = (await Promise.promisify(xml2js.parseString)(response.data)) as { xml: { [key: string]: any[] } };
    const data = _.mapValues(json.xml, (value) => (_.isArray(value) && value.length === 1 ? _.head(value) : value));
    logger.verbose(`response is ${r(data)}`);

    if (data.return_code !== 'SUCCESS') {
      throw new AsunaException(AsunaErrorCode.Unprocessable, response.data);
    }
    return data.mweb_url;
  }
}