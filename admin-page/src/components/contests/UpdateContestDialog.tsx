import React, { useState, useEffect } from 'react';
import { Contest } from '@/types/models';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { grades, Subjects } from '@/components/questions/Data';


interface UpdateContestDialogProps {
  open: boolean;
  onClose: () => void;
  contest: Contest | undefined;
  onUpdate: (contestId: string, updates: Partial<Contest>) => Promise<void>;
}

export const UpdateContestDialog: React.FC<UpdateContestDialogProps> = ({
  open,
  onClose,
  contest,
  onUpdate,
}) => {
  const [formData, setFormData] = useState<Partial<Contest>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [timeError, setTimeError] = useState<string>('');

  // Initialize form data when dialog opens
  useEffect(() => {
    if (open && contest) {
      // Convert datetime strings to local datetime-local format
      const convertToLocalDateTime = (dateTimeStr: string) => {
        if (!dateTimeStr) return '';
        
        try {
          const date = new Date(dateTimeStr);
          if (!isNaN(date.getTime())) {
            // Convert to local timezone and format as datetime-local
            const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
            return localDate.toISOString().slice(0, 16);
          }
        } catch (error) {
          console.warn('Error parsing date:', dateTimeStr, error);
        }
        
        return '';
      };

      // Normalize subject names for backward compatibility
      const normalizeSubject = (subject: string) => {
        if (!subject) return '';
        // Handle legacy subject names
        const subjectMap: Record<string, string> = {
          'Math': 'Mathematics',
          'math': 'Mathematics',
          'MATHEMATICS': 'Mathematics',
          'PHYSICS': 'Physics',
          'CHEMISTRY': 'Chemistry',
          'BIOLOGY': 'Biology',
          'ENGLISH': 'English',
          'HISTORY': 'History',
          'GEOGRAPHY': 'Geography',
          'COMPUTER SCIENCE': 'Computer Science',
          'APTITUDE': 'Aptitude'
        };
        return subjectMap[subject] || subject;
      };

      setFormData({
        title: contest.title || '',
        description: contest.description || '',
        start_time: convertToLocalDateTime(contest.start_time),
        end_time: convertToLocalDateTime(contest.end_time),
        subject: normalizeSubject(contest.subject || ''),
        grade: contest.grade || '',
        prize: contest.prize || '',
        type: contest.type || 'free',
      });
    }
  }, [open, contest]);

  // Debug: Log available options and current values
  useEffect(() => {
    if (open && contest) {
      console.log('Available subjects:', Subjects);
      console.log('Available grades:', grades);
      console.log('Current contest subject:', contest.subject);
      console.log('Current contest grade:', contest.grade);
    }
  }, [open, contest]);

  const handleInputChange = (field: keyof Contest, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contest?.id) return;

    // Validate datetime logic
    if (formData.start_time && formData.end_time) {
      const startTime = new Date(formData.start_time);
      const endTime = new Date(formData.end_time);
      
      if (endTime <= startTime) {
        setTimeError('End time must be after start time');
        return;
      }
    }
    
    // Validate subject and grade are from valid options
    if (formData.subject && !Subjects.includes(formData.subject)) {
      toast.error('Please select a valid subject from the dropdown');
      return;
    }
    
    if (formData.grade && !grades.includes(formData.grade)) {
      toast.error('Please select a valid grade from the dropdown');
      return;
    }
    
    setTimeError('');

    setIsLoading(true);
    try {
      await onUpdate(contest.id, formData);
      toast.success('Contest updated successfully');
      onClose();
    } catch (error) {
      console.error('Error updating contest:', error);
      toast.error('Failed to update contest');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  if (!contest) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto mt-16">
        <DialogHeader>
          <DialogTitle>Update Contest</DialogTitle>
          <DialogDescription>
            Update contest information. You can update any combination of fields - only the fields you change will be updated.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title || ''}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="Contest title"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <p className="text-xs text-gray-500 mb-2">
                  Choose the academic subject for this contest
                </p>
                <Select
                  value={formData.subject || ''}
                  onValueChange={(value) => handleInputChange('subject', value)}
                >
                  <SelectTrigger className={formData.subject && !Subjects.includes(formData.subject) ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {Subjects.map((subject) => (
                      <SelectItem key={subject} value={subject}>
                        {subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.subject && !Subjects.includes(formData.subject) && (
                  <p className="text-xs text-red-500">
                    ⚠️ This subject is not in the standard list. Consider updating to a valid option.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="grade">Grade</Label>
                <p className="text-xs text-gray-500 mb-2">
                  Select the target grade level for participants
                </p>
                <Select
                  value={formData.grade || ''}
                  onValueChange={(value) => handleInputChange('grade', value)}
                >
                  <SelectTrigger className={formData.grade && !grades.includes(formData.grade) ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {grades.map((grade) => (
                      <SelectItem key={grade} value={grade}>
                        {grade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.grade && !grades.includes(formData.grade) && (
                  <p className="text-xs text-red-500">
                    ⚠️ This grade is not in the standard list. Consider updating to a valid option.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prize">Prize</Label>
              <Input
                id="prize"
                value={formData.prize || ''}
                onChange={(e) => handleInputChange('prize', e.target.value)}
                placeholder="Prize description"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_time">Start Date & Time</Label>
              <p className="text-xs text-gray-500 mb-2">
                Select the date and time when the contest will start
              </p>
              <Input
                id="start_time"
                type="datetime-local"
                value={formData.start_time || ''}
                onChange={(e) => handleInputChange('start_time', e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_time">End Date & Time</Label>
              <p className="text-xs text-gray-500 mb-2">
                Select the date and time when the contest will end
              </p>
              <Input
                id="end_time"
                type="datetime-local"
                value={formData.end_time || ''}
                onChange={(e) => handleInputChange('end_time', e.target.value)}
              />
            </div>
          </div>

          {timeError && (
            <div className="text-red-500 text-sm bg-red-50 p-2 rounded">
              ⚠️ {timeError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type || 'free'}
                onValueChange={(value) => handleInputChange('type', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Contest description (optional)"
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Updating...' : 'Update Selected Fields'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}; 