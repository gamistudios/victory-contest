import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PendingPaymentsTab } from "./pending-tab";
import { ExpiredPaymentsTab } from "./expired-tab";
import { RejectedPaymentsTab } from "./rejected-tabs";
import { ApprovedPaymentsTab } from "./approved-tabs";

export function PaymentsPage() {
  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader>
          <CardTitle>Payment Requests</CardTitle>
          <CardDescription>
            Review pending and expired payment requests from users.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending">
            <TabsList className="grid w-full grid-cols-1">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="expired">Expired</TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>
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
