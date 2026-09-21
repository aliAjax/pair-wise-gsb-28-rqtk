import { Form, InputNumber, Modal, Select, TimePicker, message } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useEffect } from "react";
import { useDispatchStore } from "../data/store";

// 视图层：新增订单（送达时段、冷链标记、重量）

interface FormValues {
  code: string;
  destination: string;
  weightKg: number;
  coldChain: boolean;
  range: [Dayjs, Dayjs];
}

export default function NewOrderModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addOrder = useDispatchStore((s) => s.addOrder);
  const planningDate = useDispatchStore((s) => s.planningDate);
  const [form] = Form.useForm<FormValues>();

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        coldChain: false,
        weightKg: 100,
        range: [dayjs("09:00", "HH:mm"), dayjs("12:00", "HH:mm")]
      });
    }
  }, [open, form]);

  function submit() {
    form.validateFields().then((values) => {
      addOrder({
        code: values.code,
        destination: values.destination,
        weightKg: values.weightKg,
        coldChain: values.coldChain,
        date: planningDate,
        startMin: values.range[0].hour() * 60 + values.range[0].minute(),
        endMin: values.range[1].hour() * 60 + values.range[1].minute()
      });
      message.success("已加入待分配");
      form.resetFields();
      onClose();
    });
  }

  return (
    <Modal title="新增待分配订单" open={open} onOk={submit} onCancel={onClose} okText="加入待分配" cancelText="取消" destroyOnHidden>
      <Form form={form} layout="vertical" className="order-form">
        <Form.Item name="code" label="订单号" rules={[{ required: true, message: "请输入订单号" }]}>
          <input className="ant-input" placeholder="如 ORD-3006" />
        </Form.Item>
        <Form.Item name="destination" label="目的地" rules={[{ required: true, message: "请输入目的地" }]}>
          <input className="ant-input" placeholder="如 浦东·客户仓" />
        </Form.Item>
        <div className="form-row">
          <Form.Item name="weightKg" label="重量 kg" rules={[{ required: true, message: "请输入重量" }]}>
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="coldChain" label="冷链标记" rules={[{ required: true }]}>
            <Select
              options={[
                { value: false, label: "常温" },
                { value: true, label: "❄ 冷链" }
              ]}
            />
          </Form.Item>
        </div>
        <Form.Item name="range" label="送达时段" rules={[{ required: true, message: "请选择送达时段" }]}>
          <TimePicker.RangePicker format="HH:mm" minuteStep={15} style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
