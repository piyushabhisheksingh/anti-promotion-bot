import { supabaseAdapter } from "@grammyjs/storage-supabase";
import { createClient } from '@supabase/supabase-js';
import { USERLIST } from "../bot";


const TableName = 'session'

const FieldName = 'session'

// supabase instance
const supabase = createClient(String(process.env.DB_URL), String(process.env.DB_KEY));

//create storage
export const storage = supabaseAdapter<USERLIST>({
  supabase,
  table: TableName, // the defined table name you want to use to store your session
});