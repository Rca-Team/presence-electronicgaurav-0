
import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  fetchSelectedFace, 
  fetchAttendanceRecords, 
  fetchDailyAttendance,
  generateWorkingDays,
  isDateInArray,
  FaceInfo
} from '../utils/attendanceUtils';
import { useAttendance } from '@/contexts/AttendanceContext';

export const useAttendanceCalendar = (selectedFaceId: string | null) => {
  const { toast } = useToast();
  const { recentAttendance } = useAttendance();
  
  const [attendanceDays, setAttendanceDays] = useState<Date[]>([]);
  const [lateAttendanceDays, setLateAttendanceDays] = useState<Date[]>([]);
  const [absentDays, setAbsentDays] = useState<Date[]>([]);
  const [selectedFace, setSelectedFace] = useState<FaceInfo | null>(null);
  
  // Use current date as default selected date
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  
  const [loading, setLoading] = useState(false);
  const [dailyAttendance, setDailyAttendance] = useState<{
    id: string;
    timestamp: string;
    status: string;
  }[]>([]);
  
  // Generate working days for current month
  const currentDate = new Date();
  const [workingDays, setWorkingDays] = useState<Date[]>([]);

  // Process recent attendance data for the selected face
  useEffect(() => {
    if (selectedFaceId && recentAttendance.length > 0) {
      // Find records for the selected face
      const faceRecords = recentAttendance.filter(record => 
        record.user_id === selectedFaceId || record.id === selectedFaceId
      );
      
      if (faceRecords.length > 0) {
        // Extract attendance data
        const presentDates: Date[] = [];
        const lateDates: Date[] = [];
        
        faceRecords.forEach(record => {
          const recordDate = new Date(record.timestamp);
          // Reset time part for accurate date comparison
          recordDate.setHours(0, 0, 0, 0);
          
          // Check if this date is already in our arrays
          const dateExists = 
            presentDates.some(d => d.getTime() === recordDate.getTime()) || 
            lateDates.some(d => d.getTime() === recordDate.getTime());
            
          if (!dateExists) {
            if (record.status === 'Present' || record.status.toLowerCase().includes('present')) {
              presentDates.push(recordDate);
            } else if (record.status === 'Late' || record.status.toLowerCase().includes('late')) {
              lateDates.push(recordDate);
            }
          }
        });
        
        // Merge with existing dates to avoid clearing database-loaded records
        if (presentDates.length > 0) {
          setAttendanceDays(prev => {
            const combined = [...prev];
            presentDates.forEach(date => {
              if (!isDateInArray(date, combined)) {
                combined.push(date);
              }
            });
            return combined;
          });
        }
        
        if (lateDates.length > 0) {
          setLateAttendanceDays(prev => {
            const combined = [...prev];
            lateDates.forEach(date => {
              if (!isDateInArray(date, combined)) {
                combined.push(date);
              }
            });
            return combined;
          });
        }
        
        // If the selected date matches any recent records, update daily attendance
        if (selectedDate) {
          const selectedDateStart = new Date(selectedDate);
          selectedDateStart.setHours(0, 0, 0, 0);
          const selectedDateEnd = new Date(selectedDate);
          selectedDateEnd.setHours(23, 59, 59, 999);
          
          const recordsForSelectedDate = faceRecords.filter(record => {
            const recordDate = new Date(record.timestamp);
            return recordDate >= selectedDateStart && recordDate <= selectedDateEnd;
          });
          
          if (recordsForSelectedDate.length > 0) {
            setDailyAttendance(recordsForSelectedDate.map(record => ({
              id: record.id,
              timestamp: record.timestamp,
              status: record.status.toLowerCase()
            })));
          }
        }
      }
    }
  }, [selectedFaceId, recentAttendance, selectedDate]);

  // Subscribe to real-time updates and load initial data
  useEffect(() => {
    let attendanceChannel: any = null;

    if (selectedFaceId) {
      fetchFaceDetails(selectedFaceId);
      loadAttendanceRecords(selectedFaceId);
      
      // Generate working days for the current month
      setWorkingDays(generateWorkingDays(currentDate.getFullYear(), currentDate.getMonth()));

      attendanceChannel = supabase
        .channel(`attendance-calendar-${selectedFaceId}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'attendance_records'
          }, 
          (payload) => {
            console.log('Real-time update received for attendance calendar:', payload);
            loadAttendanceRecords(selectedFaceId);
            if (selectedDate) {
              loadDailyAttendance(selectedFaceId, selectedDate);
            }
          }
        )
        .subscribe();

      console.log('Subscribed to real-time updates for attendance calendar');
    } else {
      setSelectedFace(null);
      setAttendanceDays([]);
      setLateAttendanceDays([]);
      setAbsentDays([]);
    }

    return () => {
      if (attendanceChannel) {
        supabase.removeChannel(attendanceChannel);
        console.log('Unsubscribed from attendance calendar updates');
      }
    };
  }, [selectedFaceId]);

  // Load daily attendance when selected date changes
  useEffect(() => {
    if (selectedFaceId && selectedDate) {
      loadDailyAttendance(selectedFaceId, selectedDate);
    } else {
      setDailyAttendance([]);
    }
  }, [selectedFaceId, selectedDate]);

  // Calculate absent days
  useEffect(() => {
    if (workingDays.length > 0 && (attendanceDays.length > 0 || lateAttendanceDays.length > 0)) {
      const today = new Date();
      const absent = workingDays.filter(workDay => {
        // Only consider days up to today for absences
        if (workDay > today) return false;
        
        return !isDateInArray(workDay, attendanceDays) && !isDateInArray(workDay, lateAttendanceDays);
      });
      
      setAbsentDays(absent);
    }
  }, [workingDays, attendanceDays, lateAttendanceDays]);

  // Fetch face details
  const fetchFaceDetails = async (faceId: string) => {
    try {
      const faceInfo = await fetchSelectedFace(faceId);
      setSelectedFace(faceInfo);
    } catch (error) {
      console.error('Error fetching face details:', error);
      toast({
        title: "Error",
        description: "Failed to load face details",
        variant: "destructive"
      });
    }
  };

  // Load attendance records
  const loadAttendanceRecords = async (faceId: string) => {
    try {
      setLoading(true);
      await fetchAttendanceRecords(faceId, setAttendanceDays, setLateAttendanceDays);
    } catch (error) {
      console.error('Error loading attendance records:', error);
      toast({
        title: "Error",
        description: "Failed to load attendance records",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Load daily attendance
  const loadDailyAttendance = async (faceId: string, date: Date) => {
    try {
      await fetchDailyAttendance(faceId, date, setDailyAttendance);
    } catch (error) {
      console.error('Error loading daily attendance:', error);
      toast({
        title: "Error",
        description: "Failed to load daily attendance details",
        variant: "destructive"
      });
    }
  };

  return {
    attendanceDays,
    lateAttendanceDays,
    absentDays,
    selectedFace,
    selectedDate,
    setSelectedDate,
    loading,
    dailyAttendance,
    workingDays,
    isDateInArray
  };
};
