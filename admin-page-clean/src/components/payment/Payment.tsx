import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentStarsSettings } from "./stars-settings";
import { PendingPaymentsTab } from "./pending-tab";
import { ExpiredPaymentsTab } from "./expired-tab";
import { RejectedPaymentsTab } from "./rejected-tabs";
import { ApprovedPaymentsTab } from "./approved-tabs";

export function PaymentsPage() {
  return (
    <div className="mx-auto w-full max-w-full px-4 py-6 sm:px-6 sm:py-10 space-y-4">
      <PaymentStarsSettings />
      <Card>
        <CardHeader>
          <CardTitle className="text-xl sm:text-2xl">Payment Requests</CardTitle>
          <CardDescription>
            Review pending and expired payment requests from users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            {/* Single flat tab list (previously nested TabsLists overflowed at
                narrow widths). Scrolls horizontally on phones, centers on
                larger screens. */}
            <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto whitespace-nowrap p-1 sm:w-auto sm:justify-center">
              <TabsTrigger value="pending" className="shrink-0">
                Pending
              </TabsTrigger>
              <TabsTrigger value="expired" className="shrink-0">
                Expired
              </TabsTrigger>
              <TabsTrigger value="approved" className="shrink-0">
                Approved
              </TabsTrigger>
              <TabsTrigger value="rejected" className="shrink-0">
                Rejected
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4">
              <PendingPaymentsTab />
            </TabsContent>
            <TabsContent value="approved" className="mt-4">
              <ApprovedPaymentsTab />
            </TabsContent>
            <TabsContent value="rejected" className="mt-4">
              <RejectedPaymentsTab />
            </TabsContent>
            <TabsContent value="expired" className="mt-4">
              <ExpiredPaymentsTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
