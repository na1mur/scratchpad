"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { LoadingButton } from "@/components/loading-button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/fetcher";
import { profileSchema, type ProfileInput } from "@/lib/schemas/auth";

export function ProfileForm({ name }: { name: string | null }) {
  const router = useRouter();
  const form = useForm<ProfileInput>({ resolver: zodResolver(profileSchema), defaultValues: { name: name ?? "" } });
  const { isSubmitting, isDirty } = form.formState;

  async function onSubmit(values: ProfileInput) {
    try {
      await api("/api/settings/profile", { method: "PATCH", body: values });
      toast.success("Name saved");
      form.reset(values);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save your name.");
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex items-end gap-2">
      <Controller
        name="name"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="flex-1">
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input
              {...field}
              id="profile-name"
              autoComplete="name"
              placeholder="Ada Lovelace"
              disabled={isSubmitting}
              aria-invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </Field>
        )}
      />
      <LoadingButton type="submit" loading={isSubmitting} disabled={!isDirty}>
        {isSubmitting ? "Saving…" : "Save"}
      </LoadingButton>
    </form>
  );
}
