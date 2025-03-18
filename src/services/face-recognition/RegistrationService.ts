
import { supabase } from '@/integrations/supabase/client';
import { uploadImage } from './StorageService';
import { v4 as uuidv4 } from 'uuid';
import { descriptorToString } from './ModelService';

// Define an interface for the metadata to ensure type safety
export interface RegistrationMetadata {
  name: string;
  employee_id: string;
  department: string;
  position: string;
  firebase_image_url: string;
  faceDescriptor?: string; // Make this optional since it's added conditionally
}

export const registerFace = async (
  imageBlob: Blob,
  name: string,
  employee_id: string,
  department: string,
  position: string,
  userId: string | undefined,
  faceDescriptor?: Float32Array
): Promise<any> => {
  try {
    console.log('Starting face registration process', {
      name,
      employee_id,
      department,
      position,
      hasDescriptor: !!faceDescriptor
    });
    
    if (!imageBlob || imageBlob.size === 0) {
      console.error('Invalid image blob provided');
      throw new Error('Invalid image: The image blob is empty or invalid');
    }
    
    if (!faceDescriptor) {
      console.warn('No face descriptor provided for registration. This may limit face recognition capabilities.');
    }
    
    // Create a proper File object from the blob
    const uniqueId = uuidv4();
    const file = new File([imageBlob], `face_${uniqueId}.jpg`, { type: 'image/jpeg' });
    
    // Generate a unique file path - simplified to avoid path issues
    const filePath = `${uniqueId}.jpg`;
    console.log('Uploading with path:', filePath);
    
    // Try to upload the image to storage or use base64 as fallback
    let imageUrl;
    try {
      // Using only the 'public' bucket to avoid permission issues
      imageUrl = await uploadImage(file, filePath);
      console.log('Face image uploaded successfully:', imageUrl);
    } catch (uploadError) {
      console.error('Error uploading image, using base64 fallback:', uploadError);
      
      // Fallback: store the image directly as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageBlob);
      });
      
      imageUrl = await base64Promise;
      console.log('Image stored as base64 (fallback method)');
    }
    
    // Prepare metadata as a plain object that conforms to Json type
    const metadata: Record<string, any> = {
      name,
      employee_id,
      department,
      position,
      firebase_image_url: imageUrl
    };

    // If we have a face descriptor, store it as well
    if (faceDescriptor) {
      const descriptorString = descriptorToString(faceDescriptor);
      console.log('Descriptor converted to string, length:', descriptorString.length);
      metadata.faceDescriptor = descriptorString;
    }
    
    // Create device info as a plain object that conforms to Json type
    const deviceInfo: Record<string, any> = {
      type: 'webcam',
      registration: true,
      metadata: metadata,
      timestamp: new Date().toISOString()
    };

    console.log('Inserting attendance record with metadata');
    
    // Use a valid user ID or generate a new one
    const effectiveUserId = userId || uuidv4();
    console.log('Using user ID:', effectiveUserId);
    
    // Insert registration record
    const { data: recordData, error: recordError } = await supabase
      .from('attendance_records')
      .insert({
        user_id: effectiveUserId,
        timestamp: new Date().toISOString(),
        status: 'registered',
        device_info: deviceInfo,
        image_url: imageUrl,
      })
      .select()
      .single();

    if (recordError) {
      console.error('Error inserting attendance record:', recordError);
      throw new Error(`Error inserting attendance record: ${recordError.message}`);
    }

    console.log('Registration completed successfully:', recordData);
    return recordData;
  } catch (error: any) {
    console.error('Face registration failed:', error);
    throw error;
  }
};

export const uploadFaceImage = async (imageBlob: Blob): Promise<string> => {
  try {
    console.log('Starting face image upload, blob size:', imageBlob.size);
    
    // Validate the blob
    if (!imageBlob || imageBlob.size === 0) {
      throw new Error('Invalid image: The image blob is empty or invalid');
    }
    
    // Create a unique filename
    const uniqueId = uuidv4();
    const file = new File([imageBlob], `face_${uniqueId}.jpg`, { type: 'image/jpeg' });
    const filePath = `${uniqueId}.jpg`;
    
    console.log('Uploading image as:', filePath);
    
    // Use our storage service upload function with 'public' bucket only
    const publicUrl = await uploadImage(file, filePath);
    console.log('Image uploaded successfully:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('Error uploading face image:', error);
    throw error;
  }
};

// Store unrecognized face
export const storeUnrecognizedFace = async (imageData: string): Promise<void> => {
  try {
    console.log('Storing unrecognized face');
    
    // Convert base64 image data to a Blob
    const response = await fetch(imageData);
    const blob = await response.blob();
    
    if (!blob || blob.size === 0) {
      console.error('Failed to convert image data to blob');
      return;
    }
    
    // Upload the image or use base64 as fallback
    let imageUrl;
    try {
      imageUrl = await uploadFaceImage(blob);
    } catch (uploadError) {
      console.warn('Failed to upload unrecognized face, using base64 instead:', uploadError);
      imageUrl = imageData; // Use original base64 data
    }
    
    // Create a device info object with the current timestamp as a plain object
    const deviceInfo: Record<string, any> = {
      type: 'webcam',
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      firebase_image_url: imageUrl,
    };
    
    // Insert a record with status "unauthorized"
    const { error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: null, // No user associated
        status: 'unauthorized',
        device_info: deviceInfo,
        image_url: imageUrl,
      });
    
    if (error) {
      console.error('Error storing unrecognized face:', error);
    } else {
      console.log('Unrecognized face stored successfully');
    }
  } catch (error) {
    console.error('Failed to store unrecognized face:', error);
  }
};
