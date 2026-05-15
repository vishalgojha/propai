package com.chaoscraft.wablaster.db.daos

import androidx.room.*
import com.chaoscraft.wablaster.db.entities.Listing
import kotlinx.coroutines.flow.Flow

@Dao
interface ListingDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(listing: Listing): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(listings: List<Listing>)

    @Update
    suspend fun update(listing: Listing)

    @Delete
    suspend fun delete(listing: Listing)

    @Query("SELECT * FROM listings WHERE id = :id")
    suspend fun getById(id: Long): Listing?

    @Query("SELECT * FROM listings ORDER BY createdAt DESC")
    fun getAllFlow(): Flow<List<Listing>>

    @Query("SELECT * FROM listings WHERE status = :status ORDER BY createdAt DESC")
    fun getByStatus(status: String): Flow<List<Listing>>

    @Query("SELECT * FROM listings WHERE city = :city ORDER BY createdAt DESC")
    fun getByCity(city: String): Flow<List<Listing>>

    @Query("SELECT * FROM listings WHERE city = :city AND status = :status ORDER BY createdAt DESC")
    fun getByCityAndStatus(city: String, status: String): Flow<List<Listing>>

    @Query("SELECT * FROM listings WHERE (:city IS NULL OR city = :city) AND (:type IS NULL OR propertyType = :type) AND status != 'SOLD_OUT' ORDER BY createdAt DESC")
    fun searchActiveListings(city: String?, type: String?): Flow<List<Listing>>

    @Query("SELECT * FROM listings WHERE status != 'SOLD_OUT' ORDER BY createdAt DESC")
    fun getActiveListings(): Flow<List<Listing>>

    @Query("UPDATE listings SET status = :status WHERE id = :id")
    suspend fun updateStatus(id: Long, status: String)

    @Query("DELETE FROM listings")
    suspend fun deleteAll()
}