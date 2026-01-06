import { useCategoryFieldConfigs, getFieldsForCategory, CategoryFieldConfig } from "@/hooks/useCategoryFieldConfigs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface DynamicCategoryFieldsProps {
  category: string;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

export function DynamicCategoryFields({ category, values, onChange }: DynamicCategoryFieldsProps) {
  const { data: allConfigs = [], isLoading } = useCategoryFieldConfigs();
  
  const fields = getFieldsForCategory(allConfigs, category);
  
  if (!category) {
    return (
      <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg text-center">
        Select a category to see category-specific fields
      </div>
    );
  }
  
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </div>
    );
  }
  
  if (fields.length === 0) {
    return (
      <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg text-center">
        No additional fields configured for "{category}"
      </div>
    );
  }
  
  const handleFieldChange = (fieldName: string, value: string) => {
    onChange({ ...values, [fieldName]: value });
  };
  
  const renderField = (field: CategoryFieldConfig) => {
    const value = values[field.field_name] || "";
    const isRequired = field.is_required;
    
    switch (field.field_type) {
      case "select":
        const options = field.options || [];
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name}>
              {field.field_label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select
              value={value}
              onValueChange={(v) => handleFieldChange(field.field_name, v)}
            >
              <SelectTrigger id={field.field_name} className="bg-background">
                <SelectValue placeholder={field.placeholder || `Select ${field.field_label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent className="bg-background border">
                <SelectItem value="">None</SelectItem>
                {options.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
        
      case "textarea":
        return (
          <div key={field.id} className="space-y-2 col-span-2">
            <Label htmlFor={field.field_name}>
              {field.field_label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id={field.field_name}
              value={value}
              onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
              rows={3}
            />
          </div>
        );
        
      case "number":
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name}>
              {field.field_label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.field_name}
              type="number"
              value={value}
              onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
            />
          </div>
        );
        
      default: // text
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.field_name}>
              {field.field_label}
              {isRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.field_name}
              value={value}
              onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
              placeholder={field.placeholder || `Enter ${field.field_label.toLowerCase()}`}
            />
          </div>
        );
    }
  };
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h4 className="font-semibold text-sm">{category} Specifications</h4>
        <span className="text-xs text-muted-foreground">({fields.length} fields)</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {fields.map(renderField)}
      </div>
    </div>
  );
}
