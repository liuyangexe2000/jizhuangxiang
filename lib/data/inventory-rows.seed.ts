/**
 * 由 scripts/rebuild-inventory-from-containers.ts 根据集装箱主档汇总生成
 * 请勿手工大段编辑；集装箱变更后请重新跑 pnpm db:rebuild-inventory。
 *
 * 口径：onSite=在场+维修中；available=在场；reserved=0；incoming=在途。
 */
import type { InventoryRow } from "../types"

export const inventoryRowsSeed: InventoryRow[] = [
  {
    "id": "inv_1",
    "region": "境内",
    "city": "大连",
    "yard": "大连柏坚二号场",
    "agent": "中集凯通物流发展有限公司",
    "onSite": 30,
    "available": 30,
    "reserved": 0,
    "incoming": 19
  },
  {
    "id": "inv_2",
    "region": "境内",
    "city": "广州",
    "yard": "广州黄埔姬堂堆场",
    "agent": "中集凯通物流发展有限公司",
    "onSite": 79,
    "available": 78,
    "reserved": 0,
    "incoming": 0
  },
  {
    "id": "inv_3",
    "region": "境内",
    "city": "宁波",
    "yard": "珉钧阔野堆场",
    "agent": "上海珉泰集装箱服务有限公司",
    "onSite": 304,
    "available": 304,
    "reserved": 0,
    "incoming": 11
  },
  {
    "id": "inv_4",
    "region": "境内",
    "city": "宁波",
    "yard": "珉钧宁波堆场",
    "agent": "上海珉泰集装箱服务有限公司",
    "onSite": 123,
    "available": 58,
    "reserved": 0,
    "incoming": 0
  },
  {
    "id": "inv_5",
    "region": "境内",
    "city": "宁波",
    "yard": "珉钧小港堆场",
    "agent": "上海珉泰集装箱服务有限公司",
    "onSite": 22,
    "available": 21,
    "reserved": 0,
    "incoming": 5
  },
  {
    "id": "inv_6",
    "region": "境内",
    "city": "宁波",
    "yard": "宁波珉钧二堆场",
    "agent": "上海珉泰集装箱服务有限公司",
    "onSite": 80,
    "available": 76,
    "reserved": 0,
    "incoming": 2
  },
  {
    "id": "inv_7",
    "region": "境内",
    "city": "宁波",
    "yard": "宁波中集春晓堆场",
    "agent": "中集凯通物流发展有限公司",
    "onSite": 92,
    "available": 75,
    "reserved": 0,
    "incoming": 4
  },
  {
    "id": "inv_8",
    "region": "境内",
    "city": "宁波",
    "yard": "宁波中集奉化堆场",
    "agent": "中集凯通物流发展有限公司",
    "onSite": 30,
    "available": 30,
    "reserved": 0,
    "incoming": 0
  },
  {
    "id": "inv_9",
    "region": "境内",
    "city": "青岛",
    "yard": "青岛珉钧堆场",
    "agent": "上海珉泰集装箱服务有限公司",
    "onSite": 630,
    "available": 414,
    "reserved": 0,
    "incoming": 6
  },
  {
    "id": "inv_10",
    "region": "境内",
    "city": "厦门",
    "yard": "厦门柏坚达达堆场",
    "agent": "中集凯通物流发展有限公司",
    "onSite": 1,
    "available": 1,
    "reserved": 0,
    "incoming": 15
  },
  {
    "id": "inv_11",
    "region": "境内",
    "city": "上海",
    "yard": "东华十堆场",
    "agent": "中集凯通物流发展有限公司",
    "onSite": 6,
    "available": 6,
    "reserved": 0,
    "incoming": 0
  },
  {
    "id": "inv_12",
    "region": "境内",
    "city": "上海",
    "yard": "珉钧严永-2",
    "agent": "上海珉泰集装箱服务有限公司",
    "onSite": 282,
    "available": 184,
    "reserved": 0,
    "incoming": 49
  },
  {
    "id": "inv_13",
    "region": "境内",
    "city": "上海",
    "yard": "珉钧一分堆场",
    "agent": "上海珉泰集装箱服务有限公司",
    "onSite": 1,
    "available": 1,
    "reserved": 0,
    "incoming": 0
  },
  {
    "id": "inv_14",
    "region": "境内",
    "city": "上海",
    "yard": "上海东华十堆场",
    "agent": "中集凯通物流发展有限公司",
    "onSite": 96,
    "available": 93,
    "reserved": 0,
    "incoming": 2
  },
  {
    "id": "inv_15",
    "region": "境内",
    "city": "上海",
    "yard": "上海证名一堆场",
    "agent": "中集凯通物流发展有限公司",
    "onSite": 2,
    "available": 2,
    "reserved": 0,
    "incoming": 0
  },
  {
    "id": "inv_16",
    "region": "境内",
    "city": "深圳",
    "yard": "深圳中集大铲湾堆场",
    "agent": "中集凯通物流发展有限公司",
    "onSite": 121,
    "available": 117,
    "reserved": 0,
    "incoming": 5
  },
  {
    "id": "inv_17",
    "region": "境内",
    "city": "深圳",
    "yard": "深圳中集妈湾C堆场",
    "agent": "中集凯通物流发展有限公司",
    "onSite": 2,
    "available": 0,
    "reserved": 0,
    "incoming": 0
  },
  {
    "id": "inv_18",
    "region": "境内",
    "city": "天津",
    "yard": "珉钧天津海港华堆场",
    "agent": "上海珉泰集装箱服务有限公司",
    "onSite": 12,
    "available": 6,
    "reserved": 0,
    "incoming": 8
  },
  {
    "id": "inv_19",
    "region": "境内",
    "city": "天津",
    "yard": "天津海港华集装箱技术有限公司八号路堆场",
    "agent": "上海珉泰集装箱服务有限公司",
    "onSite": 117,
    "available": 69,
    "reserved": 0,
    "incoming": 18
  },
  {
    "id": "inv_20",
    "region": "境内",
    "city": "西安",
    "yard": "陆港堆场",
    "agent": "西安国际陆港多式联运有限公司",
    "onSite": 206,
    "available": 201,
    "reserved": 0,
    "incoming": 75
  },
  {
    "id": "inv_21",
    "region": "境外",
    "city": "布达佩斯",
    "yard": "BudAir depot - MCC",
    "agent": "宁波华联通国际物流有限公司",
    "onSite": 0,
    "available": 0,
    "reserved": 0,
    "incoming": 1
  },
  {
    "id": "inv_22",
    "region": "境外",
    "city": "杜伊斯堡",
    "yard": "D3T",
    "agent": "duisport agency GmbH",
    "onSite": 532,
    "available": 529,
    "reserved": 0,
    "incoming": 484
  },
  {
    "id": "inv_23",
    "region": "境外",
    "city": "杜伊斯堡",
    "yard": "MTD",
    "agent": "西安嘉川供应链管理有限公司",
    "onSite": 58,
    "available": 58,
    "reserved": 0,
    "incoming": 50
  },
  {
    "id": "inv_24",
    "region": "境外",
    "city": "汉堡",
    "yard": "汉堡HCS",
    "agent": "宁波华联通国际物流有限公司",
    "onSite": 114,
    "available": 110,
    "reserved": 0,
    "incoming": 58
  },
  {
    "id": "inv_25",
    "region": "境外",
    "city": "汉堡",
    "yard": "旭辉-REMAIN GmbH",
    "agent": "海南旭晖国际物流有限公司",
    "onSite": 13,
    "available": 13,
    "reserved": 0,
    "incoming": 1
  },
  {
    "id": "inv_26",
    "region": "境外",
    "city": "马拉",
    "yard": "G&S Fortune Logistics sp. z. o.o. ",
    "agent": "上海珉泰集装箱服务有限公司",
    "onSite": 0,
    "available": 0,
    "reserved": 0,
    "incoming": 1
  },
  {
    "id": "inv_27",
    "region": "境外",
    "city": "马拉",
    "yard": "PKP CARGO TERMINALE",
    "agent": "宁波华联通国际物流有限公司",
    "onSite": 60,
    "available": 60,
    "reserved": 0,
    "incoming": 173
  },
  {
    "id": "inv_28",
    "region": "境外",
    "city": "米兰",
    "yard": "米兰RHM",
    "agent": "宁波华联通国际物流有限公司",
    "onSite": 5,
    "available": 5,
    "reserved": 0,
    "incoming": 4
  }
]
