import { supabase } from './supabaseClient';

export const uploadIncidentVideo = async (
  fileUri: string,
  userId: string
): Promise<string> => {
  // In Expo/React Native we can't use Node's Buffer directly.
  // Instead, fetch the local file and upload a Blob to Supabase Storage.
  const response = await fetch(fileUri);
  const blob = await response.blob();

  const filePath = `${userId}/${Date.now()}.mp4`;

  const { data: uploadData, error } = await supabase.storage
    .from('incident-videos')
    .upload(filePath, blob, {
      contentType: 'video/mp4',
    });

  if (error || !uploadData) {
    throw new Error(error?.message || 'Failed to upload video');
  }

  const { data: publicData } = supabase.storage
    .from('incident-videos')
    .getPublicUrl(filePath);

  return publicData.publicUrl;
};

