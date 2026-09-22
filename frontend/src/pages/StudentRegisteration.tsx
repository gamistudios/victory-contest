import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "../components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { studentRegister } from "../services/studentServices";
import { useTelegram } from "../hooks/useTelegram";
import { useState } from "react";

const formSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  age: z.coerce
    .number()
    .int()
    .positive({ message: "Please enter a valid age." })
    .min(5, { message: "Student must be at least 5 years old." })
    .transform((val) => val),
  grade: z.string({ error: "Please select a grade." }),
  school: z
    .string()
    .min(3, { message: "School name must be at least 3 characters." }),
  paid: z.boolean().default(false),
  city: z.string().min(2, { message: "City must be at least 2 characters." }),
  region: z.string({ error: "Please select a region." }),
  gender: z.string({ error: "Please select a gender" }),
  imgurl: z
    .string()
    .url({ message: "Please enter a valid URL." })
    .optional()
    .or(z.literal("")),
  isSuspended: z.boolean().default(false),
  phoneNumber: z
    .string({ error: "Please write your photo number" })
    .max(13, { message: "The phone number must not exceed 10" })
    .min(10, { message: "The phone number must be 10 or 12" }),
});

export default function RegistrationForm() {
  const { user } = useTelegram();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: "",
      age: 5,
      grade: "",
      school: "",
      paid: false,
      city: "Adama",
      region: "Oromia",
      imgurl: "",
      isSuspended: false,
      phoneNumber: "",
      gender: "",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    let message;
    let success;
    try {
      setSubmitting(true);
      await studentRegister({
        ...values,
        age: values.age.toString(),
        imgurl: user?.photo_url,
        telegram_id: user?.id.toString(),
        id: user?.id.toString(),
      });

      toast.success("Succesfully registered!", {
        icon: <CheckCircle />,
        style: {
          backgroundColor: "green",
          color: "white",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: "500",
          boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
        },
      });
      setTimeout(() => {
        window.location.replace("/");
      }, 4000);

      return;
    } catch (error) {
      message = "Something went wrong";
      toast(message, {
        icon: <XCircle />,
        style: {
          backgroundColor: "#f8d7da",
          color: success ? "white" : "#721c24",
        },
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="sm:p-6 lg:p-8">
      <Card className="w-full max-w-4xl mx-auto shadow-none rounded-none bg-transparent">
        <CardHeader>
          <CardTitle className="text-2xl font-bold tracking-tight">
            Student Registration
          </CardTitle>
          <CardDescription className="dark:text-gray-400">
            Fill out the form to register a new student. All fields marked with
            * are required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Grid layout for responsive design */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8">
                {/* Name Field */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Abebe Bikila" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {/* Image URL Field */}
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Phone Number *</FormLabel>
                      <FormControl>
                        <Input placeholder="+251" {...field} />
                      </FormControl>
                      <FormDescription className="dark:text-gray-400">
                        Notice: The Number must be 12 digit and starts with +251
                        or 09|07
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a gender" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Age Field */}
                <FormField
                  control={form.control}
                  name="age"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="e.g., 14"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* School Field */}
                <FormField
                  control={form.control}
                  name="school"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>School *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Adama High School"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Grade Field */}
                <FormField
                  control={form.control}
                  name="grade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grade *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a grade" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Array.from({ length: 4 }, (_, i) => (
                            <SelectItem key={i + 1} value={`${i + 1}`}>
                              Grade {9 + i}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* City Field */}
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City *</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Adama" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Region Field */}
                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Region *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a region" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Oromia">Oromia</SelectItem>
                          <SelectItem value="Amhara">Amhara</SelectItem>
                          <SelectItem value="Tigray">Tigray</SelectItem>
                          <SelectItem value="SNNPR">SNNPR</SelectItem>
                          <SelectItem value="Sidama">Sidama</SelectItem>
                          <SelectItem value="South West Ethiopia Peoples' Region">
                            South West Ethiopia Peoples' Region
                          </SelectItem>
                          <SelectItem value="Somali">Somali</SelectItem>
                          <SelectItem value="Afar">Afar</SelectItem>
                          <SelectItem value="Benishangul-Gumuz">
                            Benishangul-Gumuz
                          </SelectItem>
                          <SelectItem value="Gambela">Gambela</SelectItem>
                          <SelectItem value="Harari">Harari</SelectItem>
                          <SelectItem value="Addis Ababa">
                            Addis Ababa
                          </SelectItem>
                          <SelectItem value="Dire Dawa">Dire Dawa</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="w-full flex items-center justify-center">
                <Button
                  disabled={submitting}
                  type="submit"
                  size="lg"
                  className="w-full"
                >
                  {submitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {submitting ? "Processing" : "Register"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
