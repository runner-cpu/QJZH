(function (global) {
  "use strict";

  const SPECIES = Object.freeze({
    "犊牦牛": Object.freeze({
      ammonia: Object.freeze({ comfortableMin: 0, comfortableMax: 10, levelTwo: 10, levelOne: 15 }), // 来源：NY/T 388-1999
      temperature: Object.freeze({ comfortableMin: -5, comfortableMax: 10 }), // 来源：计划书3.2节
      humidity: Object.freeze({ comfortableMin: 45, comfortableMax: 75 }) // 来源：GB/T 17824.3-2022
    }),
    "藏羔羊": Object.freeze({
      ammonia: Object.freeze({ comfortableMin: 0, comfortableMax: 10, levelTwo: 10, levelOne: 15 }), // 来源：NY/T 388-1999
      temperature: Object.freeze({ comfortableMin: -3, comfortableMax: 12 }), // 来源：计划书3.2节
      humidity: Object.freeze({ comfortableMin: 45, comfortableMax: 75 }) // 来源：GB/T 17824.3-2022
    }),
    "保育仔猪": Object.freeze({
      ammonia: Object.freeze({ comfortableMin: 0, comfortableMax: 10, levelTwo: 10, levelOne: 15 }), // 来源：NY/T 388-1999
      temperature: Object.freeze({ comfortableMin: 18, comfortableMax: 28 }), // 来源：GB/T 17824.3-2022
      humidity: Object.freeze({ comfortableMin: 50, comfortableMax: 70 }) // 来源：GB/T 17824.3-2022
    })
  });

  const WINDOW_RULE = Object.freeze({
    startHour: 12, // 来源：计划书3.2节
    endHour: 14, // 来源：计划书3.2节
    maxTemperatureDrop: 3 // 来源：计划书3.2节
  });

  const HYSTERESIS = Object.freeze({
    startNh3: 15.5, // 来源：计划书3.2节
    stopNh3: 9.5 // 来源：计划书3.2节
  });

  // 键格式：氨气等级_湿度等级_温度等级_时段类型。所有文本均为本地规则，不调用外部服务。
  const ADVICE_TEMPLATES = Object.freeze({
    HIGH_HIGH_COLD_NIGHT: "【紧急】氨气严重超标且湿度大、气温低！建议：①立即清理粪污降低发酵源；②检查北侧风口是否堵塞；③若幼畜出现咳嗽，准备应急升温设备。依据：计划书2.2节（氨气超标致呼吸道病）",
    HIGH_NORMAL_COLD_NIGHT: "【紧急】夜间高氨且低温，禁止贸然长时间开窗。建议：立即清理圈舍北侧粪污，检查密封缝隙，并准备保温设备后再处理换气。依据：计划书3.2节",
    HIGH_LOW_COLD_NIGHT: "【紧急】夜间氨气严重超标。建议：立即清理粪污和潮湿垫料，复核北侧风口通畅性；待午间窗口再实施短时通风。依据：NY/T 388-1999",
    HIGH_HIGH_NORMAL_NIGHT: "【紧急】高氨高湿环境正在加重。建议：马上清粪、撤除潮湿垫料并增加干燥垫料，记录幼畜咳嗽和流泪情况。依据：计划书2.2节",
    HIGH_NORMAL_NORMAL_NIGHT: "【紧急】氨气已进入高风险区。建议：立即清理主要粪污点，检查通风口堵塞；非窗口期仅做保温条件下的巡检处理。依据：NY/T 388-1999",
    HIGH_HIGH_COLD_WINDOW: "【紧急】高氨高湿且低温。建议：先清理粪污，再在12:00-14:00实施10分钟低速通风；温度降幅达到3℃立即停止。依据：计划书3.2节",
    HIGH_NORMAL_NORMAL_WINDOW: "【紧急】氨气严重超标，当前可安全处置。建议：立即清理粪污，并启动10分钟低速通风，结束后复测氨气。依据：NY/T 388-1999",
    HIGH_LOW_NORMAL_WINDOW: "【紧急】氨气严重超标。建议：立刻清粪并开启10分钟通风，重点检查北侧风口和排风扇状态。依据：NY/T 388-1999",
    HIGH_NORMAL_HOT_DAY: "【紧急】高氨伴随偏高温度。建议：清理粪污并提前安排午间通风，补充饮水，避免幼畜密集扎堆。依据：GB/T 17824.3-2022",
    MEDIUM_LOW_COLD_DAY: "【建议】氨气中等水平但气温偏低。建议：中午12:00-14:00窗口期延长通风至12分钟，其余时段保持密闭保温。依据：GB/T 17824.3 温降控制规则",
    MEDIUM_NORMAL_COLD_NIGHT: "【待办】夜间氨气已有积累且温度偏低。建议：凌晨清理圈舍北侧粪污，保持密闭保温，午间窗口再安排5分钟巡检通风。依据：计划书3.2节",
    MEDIUM_HIGH_COLD_DAY: "【待办】中等氨气叠加高湿，发酵风险升高。建议：及时更换潮湿垫料，中午窗口优先排湿通风，并清理粪污。依据：青海冬季养殖经验",
    MEDIUM_HIGH_NORMAL_WINDOW: "【待办】氨气和湿度均需处置。建议：在当前窗口通风5分钟并清理潮湿垫料，30分钟后复测氨气。依据：计划书3.2节",
    MEDIUM_NORMAL_NORMAL_WINDOW: "【待办】氨气处于中等水平。建议：完成日常清粪后在当前窗口进行5分钟巡检通风，防止下午继续积累。依据：NY/T 388-1999",
    MEDIUM_HIGH_NORMAL_DAY: "【待办】湿度偏高会加速氨气积累。建议：今天中午加强排湿，清理粪污并补充干燥垫料。依据：青海冬季养殖经验",
    LOW_HIGH_NORMAL_NIGHT: "【关注】湿度偏高但氨气尚可。建议：明天中午窗口期加强通风排湿，可考虑铺设生石灰辅助吸湿。依据：青海冬季养殖经验",
    LOW_HIGH_COLD_DAY: "【关注】低温高湿环境易造成垫料返潮。建议：补充干燥垫料，检查饮水器漏水点，午间安排排湿巡检。依据：计划书3.2节",
    LOW_HIGH_NORMAL_WINDOW: "【关注】当前氨气安全但湿度偏高。建议：利用窗口期短时排湿，检查垫料和饮水器，避免湿度继续抬升。依据：青海冬季养殖经验",
    LOW_LOW_COLD_NIGHT: "【常规状态】环境良好，注意清晨保温即可。建议：保持圈舍密闭，巡查保温设备和饮水器防冻状态。依据：计划书3.2节",
    LOW_LOW_COLD_DAY: "【常规状态】环境良好，注意清晨保温即可。建议：保持圈舍密闭，巡查保温设备和饮水器防冻状态。依据：计划书3.2节",
    LOW_NORMAL_COLD_NIGHT: "【常规状态】氨气正常、温度偏低。建议：保持保温，清晨巡查幼畜扎堆情况，午间再进行常规清粪。依据：GB/T 17824.3-2022",
    LOW_LOW_NORMAL_DAY: "【常规状态】环境指标平稳。建议：按日常节奏清粪、补水和检查垫料即可。依据：GB/T 17824.3-2022",
    LOW_NORMAL_NORMAL_DAY: "【常规状态】环境良好。建议：维持当前管理，记录午间氨气读数并完成例行清粪。依据：GB/T 17824.3-2022",
    LOW_NORMAL_NORMAL_NIGHT: "【常规状态】夜间环境平稳。建议：保持密闭保温，安排次日午间例行巡检。依据：计划书3.2节",
    LOW_LOW_HOT_DAY: "【关注】氨气较低但温度偏高。建议：保证饮水供应，检查日照区域通风条件，避免幼畜热应激。依据：GB/T 17824.3-2022",
    MEDIUM_NORMAL_HOT_DAY: "【待办】中等氨气叠加偏高温度。建议：清理粪污并提前安排午间通风，补充饮水后复测。依据：NY/T 388-1999"
  });

  global.LocalKnowledgeBase = Object.freeze({ SPECIES, WINDOW_RULE, HYSTERESIS, ADVICE_TEMPLATES });
})(window);
