package domain

type Bank struct {
    ID            string `json:"id"              dynamodbav:"id"`
    Name          string `json:"name"            dynamodbav:"name"`
    AccountNumber string `json:"account_number"  dynamodbav:"account_number"`
    AccountHolder string `json:"account_holder"  dynamodbav:"account_holder"`
    Description   string `json:"description"     dynamodbav:"description"`
    DisplayOrder  int    `json:"display_order"   dynamodbav:"display_order"`
    IsActive      bool   `json:"is_active"       dynamodbav:"is_active"`
    CreatedAt     string `json:"created_at"      dynamodbav:"created_at"`
}
