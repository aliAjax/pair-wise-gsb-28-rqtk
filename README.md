# 配送排班与发车后改派平台

冷链配送的受控排班台：订单按送达时段、温区、重量拖入车次；发车后锁住顺序/司机/温区，改派必须走交接单。

- 技术栈：React 19、Vite、TypeScript、dnd-kit、zustand
- 启动：`npm install && npm run dev`
- 构建：`npm run build`
- 规则单测：`npm run test:rules`（11 项纯规则断言）
- 流程冒烟：`npm run test:store`（14 步端到端状态断言）

## 业务规则

1. **整次拒绝**：拖入时若送达时段不被车辆时段完整覆盖、温区不符或整批超重，整次拒绝，不改动任何布局；冲突车次闪烁标红、Toast 说明冲突字段。
2. **发车锁定**：车次发车后顺序、司机、温区锁定，不能再装货、撤单或签收冻结单。
3. **受控改派**：发车后改派先建交接单（记原车次、新承接车次、未送订单），原车占用仅在交接单**生效时**释放；未生效时订单冻结（不可签收、不可再排班），承接车不得装货、不得发车。
4. **生效校验**：承接车必须未发车，且时段/温区/载重（含其他挂起交接单预约重量）全部通过才允许生效；冲突可建单留痕但不能生效，也可作废解除冻结。
5. **交接链**：每笔订单卡片展示其经历的交接链（单号、原车→承接车、状态），交接面板同时展示待生效与历史单。
6. **持久化**：车次、订单、交接链全部存入 localStorage（`hxwl-dispatch-controlled-v1`），重载后占用与交接关系一致；右上角可重置演示数据。

## 分层落位

```
src/
├── types.ts                 # 领域模型（Order / Trip / Handover / CheckResult）
├── data/seed.ts             # 数据层：车辆、订单初始数据
├── rules/validation.ts      # 规则层：纯函数校验，无 React 依赖
├── store/scheduleStore.ts   # 状态层：排班/发车/交接流转 + 持久化
├── utils/helpers.ts         # 时间窗口、占用、冻结、交接链等选择器
└── components/              # 视图层：Board 看板 / TripCard / OrderCard /
                             #         HandoverModal / HandoverPanel / 表单 / Toast
```

规则层为无副作用纯函数，可独立测试；视图只调用 store action，不直接改数据。
