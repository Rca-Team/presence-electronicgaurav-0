
import { supabase } from '@/integrations/supabase/client';
import { FaceInfo } from './types';

// Fetch face details from Supabase
export const fetchSelectedFace = async (faceId: string): Promise<FaceInfo> => {
  try {
    const { data, error } = await supabase
      .from('attendance_records')
      .select('device_info, user_id')
      .eq('id', faceId)
      .single();
        
    if (error) {
      console.error('Error fetching face details from attendance_records:', error);
      
      const { data: userData, error: userError } = await supabase
        .from('attendance_records')
        .select('device_info')
        .eq('user_id', faceId)
        .single();
        
      if (userError) {
        console.error('Error fetching face details by user_id:', userError);
        
        return {
          name: 'Unknown Student',
          employee_id: faceId,
          department: 'N/A',
          position: 'Student'
        };
      }
      
      if (userData) {
        const deviceInfo = userData.device_info as any;
        if (deviceInfo && typeof deviceInfo === 'object' && !Array.isArray(deviceInfo)) {
          const metadata = deviceInfo.metadata && typeof deviceInfo.metadata === 'object' && !Array.isArray(deviceInfo.metadata) 
            ? deviceInfo.metadata 
            : {};
          
          return {
            name: metadata.name || 'Unknown Student',
            employee_id: metadata.employee_id || faceId,
            department: metadata.department || 'N/A',
            position: metadata.position || 'Student',
          };
        }
      }
      
      return {
        name: 'Unknown Student',
        employee_id: faceId,
        department: 'N/A',
        position: 'Student'
      };
    }

    if (data) {
      const deviceInfo = data.device_info as any;
      if (deviceInfo && typeof deviceInfo === 'object' && !Array.isArray(deviceInfo)) {
        const metadata = deviceInfo.metadata && typeof deviceInfo.metadata === 'object' && !Array.isArray(deviceInfo.metadata) 
          ? deviceInfo.metadata 
          : {};
        
        return {
          name: metadata.name || 'Unknown Student',
          employee_id: metadata.employee_id || data.user_id || faceId,
          department: metadata.department || 'N/A',
          position: metadata.position || 'Student',
        };
      }
      
      return {
        name: 'Unknown Student',
        employee_id: data.user_id || faceId,
        department: 'N/A',
        position: 'Student'
      };
    }
    
    return {
      name: 'Unknown Student',
      employee_id: faceId,
      department: 'N/A',
      position: 'Student'
    };
  } catch (error) {
    console.error('Error fetching face details:', error);
    
    return {
      name: 'Unknown Student',
      employee_id: faceId,
      department: 'N/A',
      position: 'Student'
    };
  }
};
