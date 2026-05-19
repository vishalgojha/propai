package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.BroadcastListContact
import kotlinx.coroutines.flow.Flow

@Dao
interface BroadcastListContactDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(contact: BroadcastListContact)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(contacts: List<BroadcastListContact>)

    @Delete
    suspend fun delete(contact: BroadcastListContact)

    @Query("DELETE FROM broadcast_list_contacts WHERE listId = :listId AND phone = :phone")
    suspend fun deleteContact(listId: Long, phone: String)

    @Query("DELETE FROM broadcast_list_contacts WHERE listId = :listId")
    suspend fun deleteByList(listId: Long)

    @Query("SELECT * FROM broadcast_list_contacts WHERE listId = :listId ORDER BY name ASC")
    fun getByList(listId: Long): Flow<List<BroadcastListContact>>

    @Query("SELECT * FROM broadcast_list_contacts WHERE listId = :listId ORDER BY name ASC")
    suspend fun getByListSync(listId: Long): List<BroadcastListContact>

    @Query("SELECT COUNT(*) FROM broadcast_list_contacts WHERE listId = :listId")
    fun getCount(listId: Long): Flow<Int>

    @Query("SELECT COUNT(*) FROM broadcast_list_contacts WHERE listId = :listId")
    suspend fun getCountSync(listId: Long): Int
}
