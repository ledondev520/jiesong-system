/** Synthetic UI tests for the store picker: search, selection, and the pointer to 客户与门店 (no inline creation). */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem, FormLabel } from "@/components/ui/form";
import type { Store } from "@/types";
import { StoreSelect } from "./StoreSelect";

const store = (id: string, name: string, portName: string): Store => ({
  id,
  name,
  portId: `port-${id}`,
  port: { id: `port-${id}`, name: portName, code: id, isActive: true, createdAt: "", updatedAt: "" },
  isActive: true,
  createdAt: "",
  updatedAt: "",
});

function Harness({ stores, onChange }: { stores: Store[]; onChange?: (id: string) => void }) {
  const form = useForm({ defaultValues: { storeId: "" } });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="storeId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>门店 *</FormLabel>
            <StoreSelect
              stores={stores}
              value={field.value}
              onChange={(id) => {
                field.onChange(id);
                onChange?.(id);
              }}
            />
          </FormItem>
        )}
      />
    </Form>
  );
}

describe("StoreSelect", () => {
  it("没有门店时指向 客户与门店，且不再提供行内新增", () => {
    render(<Harness stores={[]} />);
    expect(screen.queryByRole("button", { name: "新增门店" })).toBeNull();
    const link = screen.getByRole("link", { name: "客户与门店" });
    expect(link).toHaveAttribute("href", "/dashboard/customers");
  });

  it("有门店时没有新增入口，选择后回调所选门店", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness stores={[store("s1", "合成门店甲", "洛杉矶"), store("s2", "合成门店乙", "长滩")]} onChange={onChange} />);
    expect(screen.queryByRole("button", { name: "新增门店" })).toBeNull();
    expect(screen.queryByRole("link", { name: "客户与门店" })).toBeNull();
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: /合成门店乙/ }));
    expect(onChange).toHaveBeenCalledWith("s2");
  });

  it("搜索按门店名或港口过滤，空结果提示没有匹配", async () => {
    const user = userEvent.setup();
    render(<Harness stores={[store("s1", "合成门店甲", "洛杉矶"), store("s2", "合成门店乙", "长滩")]} />);
    await user.type(screen.getByLabelText("搜索门店"), "长滩");
    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: /合成门店乙/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /合成门店甲/ })).toBeNull();
  });
});
